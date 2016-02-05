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

export interface ProxyOptions {
    strictSSL?: boolean;
    proxy?: string;
    port: number;
    host?: string;
    caCert?: string;
    caKey?: string;
}

export class Proxy extends events.EventEmitter implements IService {
    httpHandler: HttpHandler;
    wsHandler: WsHandler;
    opts: ProxyOptions;
    socket: string;
    services: ServiceGroup;

    constructor(opts?: ProxyOptions) {
        super();
        this.httpHandler = new HttpHandler();
        this.wsHandler = new WsHandler();
        this.opts = opts || { port: 30000 };

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
        httpServer.addListener('connect', this._connectHandler.bind(this));

        // HTTPS
        let moduleDir = path.normalize(__dirname + '/../../'),
            keyFile = this.opts.caKey || moduleDir + 'cert/dummy.key',
            certFile = this.opts.caCert || moduleDir + 'cert/dummy.crt',
            key = fs.readFileSync(keyFile, 'utf8'),
            cert = fs.readFileSync(certFile, 'utf8'),
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

        // Wrap in services for startup / shutdown
        this.services = new ServiceGroup([
            new Service(httpServer, { port: this.opts.port }),
            new Service(httpsServer, { port: this.opts.port + 1 })
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
            proxySocket = new net.Socket(),
            streamHead: Buffer[] = [head];

        // Proxy from client -> server
        function passthru(port: number) {
            proxySocket.connect(port, '127.0.0.1', () => {
                streamHead.forEach((b: Buffer) => proxySocket.write(b));
                proxySocket.pipe(clientSocket);
                clientSocket.pipe(proxySocket);

                proxySocket.on('error', (err: any) => {
                    console.log('PROXY SOCKET ERROR!!!');
                    console.log(err.stack);
                    clientSocket.write(`HTTP/${httpVersion} 500 Connection error\r\n\r\n`);
                    clientSocket.end();
                });
                clientSocket.on('error', (err: any) => proxySocket.end());
            });
        }

        // We sniff the start of the CONNECT data stream to distinguish between 3 cases:
        // 1) TLS with SNI -> Can simply forward to HTTPS server
        // 2) TLS without SNI -> Need to perform certificate sniffing
        // 3) Not TLS -> Process as a WebSocket connection
        // TODO: consider detecting websockets manually; see if we can passthru arbitrary data streams?

        let httpPort = this.opts.port,
            httpsPort = this.opts.port + 1;

        function onreadable() {
            let buf = clientSocket.read();
            if(buf !== null) {
                streamHead.push(buf);
                let full = Buffer.concat(streamHead);
                let result = sniff.detectTLS(full);
                if(result.state !== sniff.State.NEED_MORE_DATA) {
                    clientSocket.removeListener('onreadable', onreadable);
                    switch(result.state) {
                        case sniff.State.HAS_SNI:
                            passthru(httpsPort);
                            break;
                        case sniff.State.NO_SNI:
                            passthru(httpsPort);
                            break;
                        case sniff.State.NOT_TLS:
                            console.log(`NOT TLS!!`);
                            // console.log(full.toString('utf8'));
                            passthru(httpPort);
                            break;
                    }
                }
            }
        }

        clientSocket.write(`HTTP/${httpVersion} 200 Connection established\r\n\r\n`);
        clientSocket.on('readable', onreadable);
    };
}
