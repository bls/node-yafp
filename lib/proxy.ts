// High level proxy logic

import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as events from 'events';
import * as tls from 'tls';
import * as WebSocket from 'ws';
import { HttpHandler, ProxyRequestHandler } from './http';
import { WsHandler } from './ws';
import { CertificateGenerator } from './certgen';
import { IService, Service, ServiceGroup } from '@sane/service';
import * as sniff from './sniff';
import { relay, tlsRelay } from './relay';
import { ProxyOptions } from './proxy-options';

const defaultProxyOptions: ProxyOptions = {
    port: 30000,
    strictSSL: false
};

function defOpt<T>(orig: T, defaultValue: T): T {
    return typeof orig === 'undefined' ? defaultValue : orig;
}

export class Proxy extends events.EventEmitter implements IService {
    httpHandler: HttpHandler;
    wsHandler: WsHandler;
    options: ProxyOptions;
    services: ServiceGroup;

    constructor(options?: ProxyOptions) {
        super();
        this.options = options || Object.create(defaultProxyOptions);
        this.httpHandler = new HttpHandler(this.options);
        this.wsHandler = new WsHandler(this.options);

        this.httpHandler.on('error', (e: any) => this.emit('error', e));
        let requestHandler = (req: http.IncomingMessage, res: http.ServerResponse): void => {
            try {
                this.httpHandler.handleRequest(req, res);
            } catch(e) {
                this.emit('error', e);
            }
        };

        // HTTP
        let httpServer = http.createServer(requestHandler);

        // HTTPS
        let moduleDir = path.normalize(__dirname + '/../../');

        this.options.caKey = defOpt(this.options.caKey, moduleDir + 'cert/dummy.key');
        this.options.caCert = defOpt(this.options.caCert, moduleDir + 'cert/dummy.crt');

        let key = fs.readFileSync(this.options.caKey, 'utf8'),
            cert = fs.readFileSync(this.options.caCert, 'utf8'),
            certGen = new CertificateGenerator({ caKey: key, caCert: cert });

        let tlsOptions = {
            key: key,
            cert: cert,
            SNICallback: (servername: string, cb: any): void => {
                certGen.getCertificate(servername)
                    .then((result: tls.SecureContext) => cb(null, result))
                    .catch((err: any) => cb(err, null));
            }
        };
        let httpsServer = https.createServer(<any> tlsOptions, requestHandler);

        let wsServer = new WebSocket.Server({ server: httpServer }),
            wssServer = new WebSocket.Server({ server: <any> httpsServer });

        wsServer.on('connection', this.wsHandler.handleConnect.bind(this, false));
        wssServer.on('connection', this.wsHandler.handleConnect.bind(this, true));

        // Handle CONNECT
        httpServer.addListener('connect', this._connectHandler.bind(this));
        httpsServer.addListener('connect', this._connectHandler.bind(this));

        // Wrap in services for startup / shutdown
        this.services = new ServiceGroup([
            new Service(httpServer, { port: this.options.port }),
            new Service(httpsServer, { port: this.options.port + 1 })
        ]);
    }
    async start(): Promise<void> {
        await this.services.start();
    }
    async stop(): Promise<void> {
        await this.services.stop();
    }
    addHandler(h: ProxyRequestHandler): void {
        this.httpHandler.addHandler(h);
    }
    clearHandlers(): void {
        this.httpHandler.clearHandlers();
    }
    private _connectHandler(request: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
        let httpVersion = request.httpVersion,
            streamHead: Buffer[] = [head],
            ee = this;

        // We sniff the start of the CONNECT data stream to determine how to handle it.
        // 1) TLS with SNI -> Can simply forward to HTTPS server
        // 2) TLS without SNI -> Need to perform certificate sniffing
        // 3) Not TLS -> Process as a WebSocket connection
        // TODO: consider detecting websockets manually; see if we can passthru arbitrary data streams?

        let httpPort = this.options.port,
            httpsPort = this.options.port + 1;

        function onreadable() {
            let buf = clientSocket.read();
            if(buf === null) {
                return;
            }
            streamHead.push(buf);
            let data = Buffer.concat(streamHead);
            let result = sniff.detectTLS(data);
            if(result.state === sniff.State.NEED_MORE_DATA) {
                return; // TODO: timeout
            }

            // OK this still doesn't fix the case where we do a CONNECT and the client wants
            // a "different" cert somehow (e.g. expected teh right SAN etc), but should be good
            // enough for now. OTOH, if we want cert sniffing, we can now implement this assuming
            // SNI works.
            clientSocket.removeListener('onreadable', onreadable);
            let proxySocket: net.Socket;
            switch(result.state) {
                case sniff.State.HAS_SNI:
                    // Since we have SNI, we can pass the raw data stream straight
                    // to our HTTPS port.
                    proxySocket = relay(clientSocket, '127.0.0.1', httpsPort, data);
                    break;
                case sniff.State.NO_SNI:
                    // We terminate the TLS connection and proxy via a new TLS connection;
                    // this allows us to add SNI for our HTTPS server.
                    proxySocket = tlsRelay(clientSocket, '127.0.0.1', httpsPort, result.hostname, data);
                    break;
                case sniff.State.NOT_TLS:
                    proxySocket = relay(clientSocket, '127.0.0.1', httpPort, data); // Pass to HTTP server
                    break;
                // TODO: default case?
            }
            proxySocket.on('error', (err: any) => {
                clientSocket.write(`HTTP/${httpVersion} 500 Connection error\r\n\r\n`);
                clientSocket.end();
                ee.emit(err);
            });
            clientSocket.on('error', (err: any) => {
                proxySocket.end();
                ee.emit(err);
            });
        }

        clientSocket.write(`HTTP/${httpVersion} 200 Connection established\r\n\r\n`);
        clientSocket.on('readable', onreadable);
    };
}
