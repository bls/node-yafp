// High level proxy logic

import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as events from 'events';
import * as tls from 'tls';
import * as WebSocket from 'ws';
import { ProxyEngine, ProxyRequestHandler, getRequestUrl } from './engine';
import { CertificateGenerator } from './certgen';
import { IService, Service, ServiceGroup } from '@sane/service';
import * as sniff from './sniff';

/* tslint:disable:no-unused-variable */
/* TODO: REMOVE */

export interface ProxyOptions {
    strictSSL?: boolean;
    proxy?: string;
    port: number;
    host?: string;
    caCert?: string;
    caKey?: string;
}

export class Proxy extends events.EventEmitter implements IService {
    engine: ProxyEngine;
    opts: ProxyOptions;
    socket: string;
    services: ServiceGroup;

    constructor(opts?: ProxyOptions) {
        super();
        this.engine = new ProxyEngine();
        this.opts = opts || { port: 30000 };
        this.socket = os.tmpdir() + '/proxy.' + process.pid + '.sock';

        this.engine.on('error', (e: any) => this.emit('error', e));
        let requestHandler = (req: http.IncomingMessage, res: http.ServerResponse): void => {
            try {
                this.engine.handleRequest(req, res);
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

        if (fs.existsSync(this.socket)) {
            fs.unlinkSync(this.socket);
        }
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

        // WEBSOCKETS
        httpServer.addListener('upgrade', this._upgradeHandler.bind(this));
        httpsServer.addListener('upgrade', this._upgradeHandler.bind(this));

        let wsServer = new WebSocket.Server({ server: httpServer });
        wsServer.on('connection', this._onWebSocketServerConnect.bind(this, false)); // TODO

        let wssServer = new WebSocket.Server({ server: <any> httpsServer });
        wssServer.on('connection', this._onWebSocketServerConnect.bind(this, true)); // TODO

        // Wrap in services for startup / shutdown
        this.services = new ServiceGroup([
            new Service(httpServer, { port: this.opts.port }),
            new Service(httpsServer, { path: this.socket })
        ]);
    }
    async start(): Promise<void> {
        await this.services.start();
    }
    async stop(): Promise<void> {
        await this.services.stop();
    }
    addHandler(h: ProxyRequestHandler): void {
        this.engine.addHandler(h);
    }
    clearHandlers(): void {
        this.engine.clearHandlers();
    }
    private _connectHandler(request: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
        let httpVersion = request.httpVersion,
            proxySocket = new net.Socket(),
            streamHead: Buffer[] = [head];

        // Proxy from client -> server
        function passthru() {
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
        }

        // We sniff the start of the CONNECT data stream to distinguish between 3 cases:
        // 1) TLS with SNI -> Can simply forward to HTTPS server
        // 2) TLS without SNI -> Need to perform certificate sniffing
        // 3) Not TLS -> Process as a WebSocket connection
        // TODO: consider detecting websockets manually; see if we can passthru arbitrary data streams?

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
                            // console.log(`SNI: ${result.hostname}`);
                            passthru();
                            break;
                        case sniff.State.NO_SNI:
                            console.log(`NO SNI!!!`);
                            passthru();
                            break;
                        case sniff.State.NOT_TLS:
                            // TODO: If it's not a secure web socket, need to have the proxy
                            // connection go back to our insecure server.
                            console.log(`NOT TLS!!`);
                            console.log(full.toString('utf8'));
                            passthru();
                            break;
                    }
                }
            }
        }

        proxySocket.connect(this.socket, () => {
            clientSocket.write(`HTTP/${httpVersion} 200 Connection established\r\n\r\n`);
            clientSocket.on('readable', onreadable);
        });
    };

    private _onWebSocketServerConnect(isSecure: boolean, clientWS: WebSocket) {
        console.log('on web socket server connect!!!');
        // clientWS.pause();
        let req = clientWS.upgradeReq;
        let url = getRequestUrl(req);
        console.log(`websocket: ${url}`);
        var ptosHeaders: { [k: string]: string } = {};
        var ctopHeaders = req.headers;
        for (var key in ctopHeaders) {
            if (key.indexOf('sec-websocket') !== 0) {
                console.log(key);
                console.log(ctopHeaders[key]);
                ptosHeaders[key] = ctopHeaders[key];
            }
        }
        let options = {
            url: url,
            // agent: false,
            headers: ptosHeaders
        };
        let ws = new WebSocket(url, options);
        ws.on('open', () => {
            // clientWS.resume();
            clientWS.on('message', (data: Buffer, flags: any) => {
                console.log('client -> server');
                ws.send(data); // TODO: CB?
                console.log(data);
                console.log(flags);
            });
            clientWS.on('error', (e: any) => {
                console.log('CLIENTWS ERROR:');
                console.log(e.stack);
            });
            clientWS.on('close', (e: any) => {
                console.log('CLIENTWS CLOSE...');
                ws.close();
            });
            ws.on('message', (data: Buffer, flags: any) => {
                console.log('server -> client');
                clientWS.send(data);
                console.log(data);
                console.log(flags);
            });
            ws.on('close', () => {
                console.log('PROXY WEB SOCKET CLOSED');
                clientWS.close();
            });
        });
        ws.on('error', (e: any) => {
            console.log('WS ERROR:');
            console.log(e.stack);
            clientWS.close();
        });
    }

    private _upgradeHandler(request: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
        console.log('SAW UPGRADE...');
        let url = getRequestUrl(request);
        console.log(`websocket: ${url}`);


        // console.log(request);
    }
}
