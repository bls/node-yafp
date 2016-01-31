# yafp - Yet Another Forward Proxy

## Summary

YAFP is a forwarding proxy (set it as your proxy in the browser) for various hacking purposes. 

## Features

* Modern promise-based middleware syntax, designed for ES7 async/await
* Support for streaming, buffered or file based request and response modification
* Only pay for what you use: if you use stream transforms, no buffering will occur
* SSL support via [SNI](https://en.wikipedia.org/wiki/Server_Name_Indication "Server Name Indication")
* Can chain to an upstream proxy (e.g. Burp Proxy)
* Transparently handles chunked encoding, can decompress requests and responses with middleware
* Strongly typed, with TypeScript definitions

## Install

```bash
npm install yafp --save
```

## Example

Simple response modification looks something like this (in typescript):

```typescript

import * as http from 'http';
import * as yafp from 'yafp';

// Perform string replacement 
async function doTextReplacement(buf: Buffer): Promise<Buffer> {    
    let s = buf.toString('utf8').replace(/ the /gi, ' UNICORN ');
    return new Buffer(s, 'utf8');
}

async function main() {
    let listenPort = 6666,
        proxy = new yafp.Proxy({port: listenPort});
    proxy.addHandler(yafp.middleware.decompressor);
    proxy.addHandler((ctx: yafp.RequestContext) => {
        ctx.withResponse((resp: http.IncomingMessage) => {
            let toModify = ['text/html', 'text/xhtml'], // Just modify HTML
                contentType = (resp.headers['content-type'] || '').toLowerCase().split(';')[0];
            if(toModify.indexOf(contentType) !== -1) {
                ctx.withResponseBuffer(doTextReplacement); // Run string replacement
            }
        });
    });
    proxy.on('error', (e: any) => console.log(e));  // By default, will crash if you don't handle errors
    await proxy.start();
    console.log(`Proxy listening on port: ${listenPort}`);
}

main();

```

Ideas
-----

* Interesting to test https://badssl.com/ -> would be great to repro this testing in unit tests.

Credits
-------

* Thanks to https://github.com/runk/node-thin for inspiration and original code
* TLS/SNI detection from: https://github.com/dlundquist/sniproxy/

TODO
----

* WebSocket proxying
* Certificate sniffing
* WebSocket proxying through an upstream proxy

