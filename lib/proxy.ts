// High level proxy logic

import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as events from 'events';
import * as tls from 'tls';
import { ProxyEngine, ProxyRequestHandler } from './engine';
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

        function onreadable() {
            let buf = clientSocket.read();
            if(buf !== null) {
                streamHead.push(buf);
                let full = Buffer.concat(streamHead);
                let result = sniff.detectTLS(full);
                if(result.state === sniff.State.NEED_MORE_DATA) {
                    console.log('NOT ENOUGH DATA YET');
                } else {
                    clientSocket.removeListener('onreadable', onreadable);
                    switch(result.state) {
                        case sniff.State.HAS_SNI:
                            console.log(`SNI: ${result.hostname}`);
                            passthru();
                            break;
                        case sniff.State.NO_SNI:
                            passthru();
                            break;
                        case sniff.State.NOT_TLS:
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
}
