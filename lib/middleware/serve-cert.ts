
import { RequestContext } from '../http';
import * as http from 'http';
import * as fs from '@sane/fs';

export function serveCert(ctx: RequestContext) {
    ctx.withRequest((req: http.IncomingMessage) => {
        if(ctx.url === 'http://yafp/cert') {
            req.headers['host'] = `127.0.0.1:${ctx.options.port}`;
            req.url = '/';
            ctx.withResponse((res) => {
                res.statusCode = 200;
                res.statusMessage = 'OK';
                res.headers['content-type'] = 'application/x-x509-ca-cert';
                ctx.withResponseBuffer(async () => {
                    let b: Buffer = await fs.readFileAsync(ctx.options.caCert);
                    res.headers['content-length'] = b.length;
                    return b;
                });
            });
        }
    });
}
