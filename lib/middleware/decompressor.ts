
import * as zlib from 'zlib';
import * as http from 'http';
import { RequestContext } from '../http-handler';

function decompressorFor(response: http.IncomingMessage): NodeJS.ReadWriteStream {
    let contentEncoding = response.headers['content-encoding'];
    if(!contentEncoding) {
        return null;
    }
    switch (contentEncoding.toLowerCase()) {
        case 'x-gzip':
        case 'gzip':
            return zlib.createGunzip();
        case 'deflate':
            return zlib.createInflate();
        default:
            return null;
    }
}

export function decompressor(ctx: RequestContext) {
    ctx.withResponse((resp) => {
        let transform = decompressorFor(resp);
        if(transform !== null) {
            ctx.withResponseStream(async (data) => {
                delete resp.headers['content-encoding'];
                delete resp.headers['content-length'];
                data.pipe(transform); // return data.pipe(transform);
                return transform;
            });
        }
    });
}
