# yafp - Yet Another Forward Proxy

## Summary

YAFP is a forwarding proxy (set it as your proxy in the browser) for various hacking purposes. 

Good for MITM (man in the middle) attacks, game hacking, instrumenting JavaScript and HTTP debugging.

## Features

* Modern promise-based middleware syntax, designed for ES7 async/await
* Support for streaming, buffered or file based request and response modification
* Only pay for what you use: if you use stream transforms, no buffering will occur
* SSL support via [SNI](https://en.wikipedia.org/wiki/Server_Name_Indication "Server Name Indication")
* Can chain to an upstream proxy (e.g. Burp Proxy)
* Supports ws:// and wss:// WebSockets and will tunnel them through upstream proxies as well
* Transparently handles chunked encoding, can decompress requests and responses with middleware
* Strongly typed, with TypeScript definitions

## Requirements

* Requires node.js >= 4.0.0

## Install

```bash
npm install yafp --save
```

## Example

Simple response modification looks something like this (in typescript):

```typescript

import * as http from 'http';
import * as yafp from 'yafp';

async function textReplace(buf: Buffer): Promise<Buffer> {
    let s = buf.toString('utf8').replace(/ the /gi, ' UNICORN ');
    return new Buffer(s, 'utf8');
}

function isHtml(resp: http.IncomingMessage): boolean {
    let htmlContentTypes = ['text/html', 'text/xhtml'],
        contentType = (resp.headers['content-type'] || '').toLowerCase().split(';')[0];
    return htmlContentTypes.indexOf(contentType) !== -1
}

async function main() {
    let listenPort = 6666,
        proxy = new yafp.Proxy({port: listenPort});
    proxy.addHandler(yafp.middleware.decompressor);
    proxy.addHandler((ctx: yafp.RequestContext) => {
        ctx.withResponse((resp: http.IncomingMessage) => {
            if(isHtml(resp)) {
                ctx.withResponseBuffer(textReplace);
            }
        });
    });
    proxy.on('error', (e: any) => console.log(e));  // By default, will crash if you don't handle errors
    await proxy.start();
    console.log(`Proxy listening on port: ${listenPort}`);
}

main();

```

Credits
-------

* Thanks to https://github.com/runk/node-thin for inspiration and original code
* TLS/SNI detection from: https://github.com/dlundquist/sniproxy/

TODO / NOTES / IDEAS
--------------------

* Interesting to test https://badssl.com/ -> would be great to repro this testing in unit tests.
* Certificate sniffing
* Add support for upstream proxy-auth
* NTLM proxy auth?  
* Maybe use proxy-agent, node-proxying-agent or http-proxy-agent instead of tunnel-agent?
* Ensure SSLv2 works, by enabling insecure protocols for the https server
    * Srsly, how to test that though? Hardly anything supports it anymore...
* Something like a "conntrack" table, enabling debug context across CONNECT 
* Test that server name is correctly recovered from the SNI server name if it's 
  not present in a host header or whatnot. Basically:
  openssl s_client -connect localhost:6667 -servername www.google.com
  GET / HTTP/1.0 -> should return page.
* Ohhh looks like we need a connection table; what about non HTTPs connect?
* withResponseFile -> if you specify an existing file, that file will get deleted.... 
  hmmm. that might not be good?
  