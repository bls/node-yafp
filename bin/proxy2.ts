
import * as http from 'http';
import { Proxy } from '../lib/proxy';
import { RequestContext } from '../lib/http';
import { decompressor } from '../lib/middleware/decompressor';
// import { nocache } from '../lib/middleware/nocache';

let proxy = new Proxy({port: 6666});
proxy.addHandler(decompressor);
// proxy.addHandler(nocache);
proxy.addHandler((ctx: RequestContext): void => {
    ctx.withRequest((req: http.IncomingMessage): void => {
        console.log(` - ${req.method} ${req.url}`);
    });
    ctx.withResponse((resp: http.IncomingMessage): void => {
        console.log(`${resp.statusCode} ${resp.statusMessage} ${resp.httpVersion}`);
    });
});
proxy.on('error', (e: any) => {
    console.log(e);
});
proxy.start();
