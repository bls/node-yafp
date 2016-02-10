
import { RequestContext } from '../http';
import * as fs from '@sane/fs';

// TODO: this is a hack
// TODO: request hijacking would make this a lot nicer...
export function serveCert(ctx: RequestContext) {
    ctx.withRequest((req) => {
        if(ctx.url === 'http://yafp/cert') {
            req.headers['host'] = 'google.com';
            ctx.withResponse((res) => {
                res.statusCode = 200;
                res.statusMessage = 'OK';
                res.headers['content-type'] = 'application/x-x509-ca-cert';
                ctx.withResponseBuffer(async () => {
                    // Just totally overwrite the response, ignore input.
                    let b: Buffer = await fs.readFileAsync(ctx.options.caCert);
                    res.headers['content-length'] = b.length;
                    return b;
                });
            });
        }
    });
}
