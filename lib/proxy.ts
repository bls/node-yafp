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
        //httpServer.addListener('upgrade', this._ugpradeHandler.bind(this));
        // httpsServer.addListener('upgrade', this._ugpradeHandler.bind(this));

        let wsServer = new WebSocket.Server({ server: httpServer });
        wsServer.on('connection', this._onWebSocketServerConnect.bind(this, false)); // TODO

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
                            // console.log(`NOT TLS!!`);
                            // console.log(full.toString('utf8'));
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

    // TODO: This does nothing!!!
    private _ugpradeHandler(request: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
        this.proxyWS(request, clientSocket, head);
    }

    private proxyWS(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
        // TODO: what about a WS request without a Host: header?
        // TODO: could we use the CONNECT thingy to get the header?
        clientSocket.pause();
        let url = getRequestUrl(req);
        console.log(`websocket: ${url}`);
        var ptosHeaders: { [k: string]: string } = {};
        var ctopHeaders = req.headers;
        for (var key in ctopHeaders) {
            if (key.indexOf('sec-websocket') !== 0) {
                ptosHeaders[key] = ctopHeaders[key];
            }
        }
        let options = {
            url: url,
            // agent: false,
            headers: ptosHeaders
        };

        // TODO: how to read messages from clientSocket and then forward -> ws?

        let ws = new WebSocket(url, options);
        ws.on('open', () => {
            console.log('PROXY WEB SOCKET OPENED!!');
            clientSocket.resume();
            ws.on('message', (data: Buffer, flags: any) => {
                console.log(data);
                console.log(flags);
            });
            ws.on('close', () => {
                console.log('PROXY WEB SOCKET CLOSED');
                clientSocket.end();
            });
        });
        ws.on('error', (e: any) => {
            // TODO: forward to upstream error handler?

            clientSocket.end();
        });
    }

    /*
    // Basic web socket proxying to start with...
    private _makeProxyToServerWebSocket() {
        // pause the client's socket

        // Get the options from the
        var url;
        if (ctx.clientToProxyWebSocket.upgradeReq.url == "" || /^\//.test(ctx.clientToProxyWebSocket.upgradeReq.url)) {
            var hostPort = Proxy.parseHostAndPort(ctx.clientToProxyWebSocket.upgradeReq);
            url = (ctx.isSSL ? "wss" : "ws") + "://" + hostPort.host + (hostPort.port ? ":"
                    + hostPort.port : "") + ctx.clientToProxyWebSocket.upgradeReq.url;
        } else {
            url = ctx.clientToProxyWebSocket.upgradeReq.url;
        }
        var ptosHeaders = {};
        var ctopHeaders = ctx.clientToProxyWebSocket.upgradeReq.headers;
        for (var key in ctopHeaders) {
            if (key.indexOf('sec-websocket') !== 0) {
                ptosHeaders[key] = ctopHeaders[key];
            }
        }
        ctx.proxyToServerWebSocketOptions = {
            url: url,
            agent: false,
            headers: ptosHeaders
        };

        proxyToServerWebSocket = new WebSocket(ctx.proxyToServerWebSocketOptions.url, ctx.proxyToServerWebSocketOptions);
        proxyToServerWebSocket.on('message', self._onWebSocketMessage.bind(self, ctx));
        proxyToServerWebSocket.on('error', self._onWebSocketError.bind(self, ctx));
        proxyToServerWebSocket.on('close', self._onWebSocketClose.bind(self, ctx, true));
        proxyToServerWebSocket.on('open', function() {
            ctx.clientToProxyWebSocket.resume();
        });


    }
    */

    private _onWebSocketServerConnect() {
        console.log('on web socket server connect!!!');
    }
}
