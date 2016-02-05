// Proxy WebSocket connections

import * as WebSocket from 'ws';
import * as events from 'events';
import normalizeCase = require('header-case-normalizer');

export class WsHandler extends events.EventEmitter {
    constructor() {
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
        let options = {
            url: url,
            rejectUnauthorized: false,  // TODO: MAKE AN OPTION
            headers: ptosHeaders,
        };
        let ws = new WebSocket(url, options);
        ws.on('open', () => {
            clientWS.resume();
            clientWS.on('message', (data: Buffer, flags: any) => {
                ws.send(data, { binary: flags.binary, mask: flags.masked }); // TODO: CB
            });
            clientWS.on('error', (e: any) => {
                this.emit(e);
                ws.close();
            });
            clientWS.on('close', (e: any) => {
                ws.close();
            });
            ws.on('message', (data: Buffer, flags: any) => {
                console.log(data);
                clientWS.send(data, { binary: flags.binary, mask: flags.masked }); // TODO: CB
            });
            ws.on('close', () => {
                clientWS.close();
            });
        });
        ws.on('error', (e: any) => {
            this.emit(e);
            clientWS.close();
        });
    }
}
