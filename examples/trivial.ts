
import * as proxy from '../lib/index';

let p = new proxy.Proxy({port: 6666});
p.addHandler(proxy.middleware.decompressor);
p.addHandler(proxy.middleware.nocache);
p.on('error', (e: any) => {
    console.log(e);
});
p.start();
