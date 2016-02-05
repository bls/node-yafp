// Proxy WebSocket connections

import * as WebSocket from 'ws';
import * as events from 'events';
import { httpOverHttp, httpsOverHttp } from 'tunnel-agent';
import normalizeCase = require('header-case-normalizer');

export interface Options {
    proxy?: string;
}

export class WsHandler extends events.EventEmitter {
    constructor(public options: Options) {
        super();
    }

    handleConnect(isSecure: boolean, clientWS: WebSocket) {
        // Note: Host header is "required" as per rfc 6455 section 1.3
        clientWS.pause();
        let req = clientWS.upgradeReq;
        let suffix = req.headers['host'],
            url = (isSecure ? 'wss' : 'ws') + '://' + suffix + req.url;
        var ptosHeaders: { [k: string]: string } = {};
        var ctopHeaders = req.headers;

        for (let key in ctopHeaders) {
            if(key.indexOf('sec-websocket') !== 0) {
                ptosHeaders[normalizeCase(key)] = ctopHeaders[key];
            }
        }
        let wsOptions: any = {
            url: url,
            rejectUnauthorized: false,  // TODO: MAKE AN OPTION
            headers: ptosHeaders,
        };
        if(this.options.proxy) {
            let factory = isSecure ? httpsOverHttp : httpOverHttp;
            let agent = factory({ proxy: this.options.proxy });
            wsOptions.agent = agent;
        }
        let ws = new WebSocket(url, wsOptions);
        ws.on('error', (e: any) => {
            this.emit(e);
            clientWS.close();
        });
        clientWS.on('error', (e: any) => {
            this.emit(e);
            ws.close();
        });
        ws.on('open', () => {
            clientWS.resume();
            clientWS.on('message', (data: Buffer, flags: any) => {
                ws.send(data, { binary: flags.binary, mask: flags.masked }); // TODO: CB
            });
            clientWS.on('close', (e: any) => {
                ws.close();
            });
            ws.on('message', (data: Buffer, flags: any) => {
                clientWS.send(data, { binary: flags.binary, mask: flags.masked }); // TODO: CB
            });
            ws.on('close', () => {
                clientWS.close();
            });
        });
    }
}
