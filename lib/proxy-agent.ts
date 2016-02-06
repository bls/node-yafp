// Create HTTP agent for CONNECT tunneling, used for WebSocket proxy support

import { httpOverHttp, httpsOverHttp, httpOverHttps, httpsOverHttps } from 'tunnel-agent';
import { parse } from 'url';
import * as http from 'http';

function isSecureProtocol(url: string): boolean {
    let secureProtocols = ['https:', 'wss:'];
    return secureProtocols.indexOf(parse(url).protocol) !== -1;
}

export function proxyAgent(url: string, proxyUrl: string): http.Agent {
    let innerIsSecure = isSecureProtocol(url),
        outerIsSecure = isSecureProtocol(proxyUrl);

    let factory: any;
    if(innerIsSecure) {
        factory = outerIsSecure ? httpsOverHttps : httpsOverHttp;
    } else {
        factory = outerIsSecure ? httpOverHttps : httpOverHttp;
    }

    let parsedProxyUrl = parse(proxyUrl);
    let tunnelOptions: any = {
        proxy : {
            host: parsedProxyUrl.hostname,
            port: parsedProxyUrl.port
        }
    };

    return <http.Agent> factory(tunnelOptions);
}

