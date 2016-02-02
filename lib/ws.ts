// Proxy WebSocket connections
// TODO: headers are currently not reflected from upgrade responses back to the client.
// TODO: To implement this, would need to get upgrade response before sending response to ws client.

import * as WebSocket from 'ws';
import * as events from 'events';
import { getRequestUrl } from './http';
import normalizeCase = require('header-case-normalizer');

export class WsHandler extends events.EventEmitter {
    constructor() {
        super();
    }

    handleConnect(isSecure: boolean, clientWS: WebSocket) {
        // console.log('on web socket server connect!!!');
        clientWS.pause();
        // console.log(clientWS.upgradeReq.url);
        console.log(`upgradeREQ URL: ${clientWS.upgradeReq.url}`);
        let TESTZZZ = getRequestUrl(clientWS.upgradeReq);
        console.log(`TEST: ${TESTZZZ}`);
        let req = clientWS.upgradeReq;

        // let z = req.headers['host'].split(':')[1];
        // if(z === '443') {
        // HACK HACK FORCE SECURE???  AGAR.IO BREAKS W/OUT THIS?
        // isSecure = true;
        // }

        // let httpUrl = getRequestUrl(req),
        // suffix = httpUrl.split(':')[1],

        // TODO: Think
        let suffix = req.headers['host'],
            url = (isSecure ? 'wss' : 'ws') + '://' + suffix + req.url;
        console.log(`websocket: ${url}`);
        var ptosHeaders: { [k: string]: string } = {};
        var ctopHeaders = req.headers;

        // Hmmm, seems like we need working sec-websocket stuff.
        //
        // Access-Control-Allow-Origin: *
        // Access-Control-Expose-Headers: BLAH BLAH.
        //     For this to work, we need to snoop the upgrade response.
        // NOTE: NOT REQUIRED; WEBSOCKETS DON'T DO SOP

        console.log(`WS VERSION: ${ctopHeaders['sec-websocket-version']}`);
        for (let key in ctopHeaders) {
            if(key.indexOf('sec-websocket') === 0) {
                console.log(`DROPPED: ${key} -> ${ctopHeaders[key]}`);
            } else {
                let k = normalizeCase(key);
                console.log(`${k} -> ${ctopHeaders[key]}`);
                ptosHeaders[k] = ctopHeaders[key];
            }
        }
        let options = {
            url: url,
            // agent: false,
            rejectUnauthorized: false,  // TODO: OPTIONAL?
            headers: ptosHeaders,
            // ^ Above improves compatilbity...
        };
        let ws = new WebSocket(url, options);
        ws.on('open', () => {
            clientWS.resume();
            clientWS.on('message', (data: Buffer, flags: any) => {
                console.log('client -> server');
                // ws.send(data, { binary: flags.binary, mask: flags.masked }); // TODO: CB?
                ws.send(data, { binary: flags.binary }); // TODO: CB?
                console.log(data);
                console.log(flags);
            });
            clientWS.on('error', (e: any) => {
                console.log('CLIENTWS ERROR:');
                console.log(e.stack);
            });
            clientWS.on('close', (e: any) => {
                console.log('CLIENTWS CLOSE...');
                ws.close();
            });
            ws.on('message', (data: Buffer, flags: any) => {
                console.log('server -> client');
                clientWS.send(data, { binary: flags.binary, mask: flags.masked });
                console.log(data);
                console.log(flags);
            });
            ws.on('close', () => {
                console.log('PROXY WEB SOCKET CLOSED');
                clientWS.close();
            });
        });
        ws.on('error', (e: any) => {
            console.log('WS ERROR:');
            console.log(e.stack);
            clientWS.close();
        });

        // DEBUGGING: CHECK OUT THE SERVER RESPONSE...
        // let fuuu = (res: http.IncomingMessage) => {
        //     console.log('DEBUG FOR UPGRADE:');
        //     // console.log(res);
        //     for(let k in res.headers) {
        //         if(true) {
        //             console.log(`${k}: ${res.headers[k]}`);
        //         }
        //     }
        // };
        // ws.on('fnord', <any> fuuu);
    }
}
