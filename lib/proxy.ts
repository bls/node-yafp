// High level proxy logic

import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as events from 'events';
import * as tls from 'tls';
import * as WebSocket from 'ws';
import { ProxyEngine, ProxyRequestHandler, getRequestUrl } from './engine';
import { CertificateGenerator } from './certgen';
import { IService, Service, ServiceGroup } from '@sane/service';
import * as sniff from './sniff';
let headerCaseNormalizer: any = require('header-case-normalizer');

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
        // httpServer.addListener('upgrade', this._upgradeHandler.bind(this));
        // httpsServer.addListener('upgrade', this._upgradeHandler.bind(this));

        let wsServer = new WebSocket.Server({ server: httpServer });
        wsServer.on('connection', this._onWebSocketServerConnect.bind(this, false));

        let wssServer = new WebSocket.Server({ server: <any> httpsServer });
        wssServer.on('connection', this._onWebSocketServerConnect.bind(this, true));

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

    private _onWebSocketServerConnect(isSecure: boolean, clientWS: WebSocket) {
        // console.log('on web socket server connect!!!');
        clientWS.pause();
        // console.log(clientWS.upgradeReq.url);
        console.log(`upgradeREQ URL: ${clientWS.upgradeReq.url}`);
        let TESTZZZ = getRequestUrl(clientWS.upgradeReq);
        console.log(`TEST: ${TESTZZZ}`);
        let req = clientWS.upgradeReq;

        // let z = req.headers['host'].split(':')[1];
        // if(z === '443') {
            // HACK HACK FORCE SECURE???  AGAR.IO BREAKS W/OUT THIS?
            // isSecure = true;
        // }

        let httpUrl = getRequestUrl(req),
            // suffix = httpUrl.split(':')[1],
            suffix = req.headers['host'], // TODO!!!
            url = (isSecure ? 'wss' : 'ws') + '://' + suffix + req.url;
        console.log(`websocket: ${url}`);
        var ptosHeaders: { [k: string]: string } = {};
        var ctopHeaders = req.headers;

        // Hmmm, seems like we need working sec-websocket stuff.
        //
        // Access-Control-Allow-Origin: *
        // Access-Control-Expose-Headers: BLAH BLAH.
        //     For this to work, we need to snoop the upgrade response.
        //

        console.log(`WS VERSION: ${ctopHeaders['sec-websocket-version']}`);
        for (let key in ctopHeaders) {
            if(key.indexOf('sec-websocket') === 0) {
                console.log(`DROPPED: ${key} -> ${ctopHeaders[key]}`);
            } else {
                let k = headerCaseNormalizer(key);
                console.log(`${k} -> ${ctopHeaders[key]}`);
                ptosHeaders[k] = ctopHeaders[key];
            }
        }
        let options = {
            url: url,
            // agent: false,
            rejectUnauthorized: false,  // TODO: OPTIONAL?
            headers: ptosHeaders,
            // ^ Above improves compatilbity...
        };
        let ws = new WebSocket(url, options);
        ws.on('open', () => {
            clientWS.resume();
            clientWS.on('message', (data: Buffer, flags: any) => {
                console.log('client -> server');
                // ws.send(data, { binary: flags.binary, mask: flags.masked }); // TODO: CB?
                ws.send(data, { binary: flags.binary }); // TODO: CB?
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
                clientWS.send(data, { binary: flags.binary, mask: flags.masked });
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
        // DEBUGGING: CHECK OUT THE SERVER RESPONSE...

        let fuuu = (res: http.IncomingMessage) => {
            console.log('DEBUG FOR UPGRADE:');
            // console.log(res);
            for(let k in res.headers) {
                if(true) {
                    console.log(`${k}: ${res.headers[k]}`);
                }
            }
        };
        ws.on('fnord', <any> fuuu);
    }
}
