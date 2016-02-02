
import { RequestContext } from '../http';

// TODO: this is not really working ><
export function nocache(ctx: RequestContext) {
    ctx.withRequest((req) => {
        delete req.headers['if-modified-since'];
        delete req.headers['if-none-match'];
        delete req.headers['if-range'];
        delete req.headers['if-unmodified-since'];
    });
    ctx.withResponse((resp) => {
        resp.headers['cache-control'] = 'private, max-age=0, no-cache';
        resp.headers['expires'] = '';
    });
}
