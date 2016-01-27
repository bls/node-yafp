import * as fs from 'fs';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { IService, Service, ServiceGroup } from '@sane/service';

export interface Options {
    httpPort: number;
    httpsPort: number;
}

export class TestServer implements IService {
    app: express.Express;
    httpsOpts: any;
    services: ServiceGroup;

    constructor(options: Options) {
        this.httpsOpts = {
            key:  fs.readFileSync('./cert/dummy.key', 'utf8'),
            cert: fs.readFileSync('./cert/dummy.crt', 'utf8')
        };

        this.app = express();
        this.app.use(bodyParser.urlencoded({ extended: true }));

        this.app.all('/test', function(req, res) {
            res.json({
                protocol: req.protocol,
                method:   req.method,
                query:    req.query,
                body:     req.body,
                headers:  req.headers
            });
        });

        this.app.all('/response_modify', function(req, res) {
            res.send('CHANGEME');
        });

        this.app.all('/redirect', function(req, res) {
            res.redirect(302, '/not-found#fragment');
        });

        this.app.all('/not-found', function(req, res) {
            res.status(404).json({status: 404});
        });

        this.app.get('/gzip-busted', function(req, res) {
            res.header('content-encoding', 'gzip');
            res.send('this is not valid gzipped content!');
        });

        this.app.get('/gzip-working', function(req, res) {
            res.header('content-encoding', 'gzip');
            let content = zlib.gzipSync(new Buffer('gzip is working'));
            res.send(content);
        });

        let httpService = new Service(http.createServer(this.app), { port: options.httpPort }),
            httpsService = new Service(https.createServer(this.httpsOpts, this.app), { port: options.httpsPort });

        this.services = new ServiceGroup([httpService, httpsService]);
    }
    start(): Promise<void> {
        return this.services.start();
    }
    stop(): Promise<void> {
        return this.services.stop();
    }
}
