import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as events from 'events';
import * as tls from 'tls';
import { ProxyEngine, ProxyRequestHandler } from './engine';
import { CertificateGenerator } from './certgen';
import { IService, Service, ServiceGroup } from '@sane/service';

export interface ProxyOptions {
    strictSSL?: boolean;
    proxy?: string;
    port: number;
    host?: string;
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
        let key = fs.readFileSync('./cert/dummy.key', 'utf8'),
            cert = fs.readFileSync('./cert/dummy.crt', 'utf8'),
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
    async start() {
        await this.services.start();
    }
    async stop() {
        await this.services.stop();
    }
    addHandler(h: ProxyRequestHandler): void {
        this.engine.addHandler(h);
    }
    clearHandlers() {
        this.engine.clearHandlers();
    }
    private _connectHandler(request: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) {
        let httpVersion = request.httpVersion;

        var proxySocket = new net.Socket();
        proxySocket.connect(this.socket, () => {
            proxySocket.write(head);
            clientSocket.write(`HTTP/${httpVersion} 200 Connection established\r\n\r\n`);

            proxySocket.pipe(clientSocket);
            clientSocket.pipe(proxySocket);

            proxySocket.on('error', (err: any) => {
                clientSocket.write(`HTTP/${httpVersion} 500 Connection error\r\n\r\n`);
                clientSocket.end();
            });
            clientSocket.on('error', (err: any) => proxySocket.end());
        });
    };
}
