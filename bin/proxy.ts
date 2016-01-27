
import * as proxy from '../lib/proxy';

let p = new proxy.Proxy({port: 5555});
p.start();
p.on('error', (e: any) => {
    console.log(e);
});
