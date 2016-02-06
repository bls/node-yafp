// A passthrough proxy

import * as yafp from '../lib/index';

let listenPort = 6666,
    proxy = new yafp.Proxy({port: 6666});

proxy.addHandler(yafp.middleware.decompressor);
proxy.addHandler(yafp.middleware.nocache);
proxy.on('error', (e: any) => { console.log(e.stack); });
proxy.start().then(() => console.log(`Proxy listening on port: ${listenPort}`));
