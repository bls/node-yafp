import * as assert from 'assert';
import { TestServer } from './helpers/TestServer';
import { Proxy } from '../lib/proxy';
import { proxyAgent } from '../lib/proxy-agent';
import { ServiceGroup } from '@sane/service';
import { promiseCallback } from '../lib/util';
import * as WebSocket from 'ws';

describe('WebSocket proxy', () => {
    var testServer = new TestServer({httpPort: 30000, httpsPort: 30001}),
        proxy = new Proxy({port: 30002, host: 'localhost'}),
        proxyUrl = 'http://localhost:30002',
        services = new ServiceGroup([testServer, proxy]);

    beforeEach((done) => promiseCallback(services.start(), done));
    afterEach((done) => promiseCallback(services.stop(), done));
    beforeEach(() => {
        proxy.removeAllListeners('error');
        proxy.clearHandlers();
    });

    it('should proxy ws:// protocol', (done) => {
        let wsUrl = 'ws://127.0.0.1:30000/echo',
            ws = new WebSocket(wsUrl, { agent: proxyAgent(wsUrl, proxyUrl) }),
            greeting = 'hello there!';
        ws.on('open', () => {
            ws.send(greeting);
            ws.on('message', (msg) => {
                assert.equal(msg, greeting);
                ws.close();
                done();
            });
        }).on('error', (err: any) => done(err));
    });

    it('should should proxy wss:// protocol', (done) => {
        let wsUrl = 'wss://127.0.0.1:30000/echo',
            ws = new WebSocket('wss://127.0.0.1:30001/echo', { agent: proxyAgent(wsUrl, proxyUrl) }),
            greeting = 'OHAI HOW ARE YOU??';
        ws.on('open', () => {
            ws.send(greeting);
            ws.on('message', (msg) => {
                assert.equal(msg, greeting);
                ws.close();
                done();
            });
        }).on('error', (err: any) => done(err));
    });

    it('should handle fast sender (no lost msgs)', (done) => {
        let wsUrl = 'ws://127.0.0.1:30000/blast',
            ws = new WebSocket(wsUrl, { agent: proxyAgent(wsUrl, proxyUrl) }),
            count = 0;
        ws.on('open', () => {
            ws.on('message', () => {
                count++;
                if(count == 1000) {
                    ws.close();
                    done();
                }
            });
        });
    });

    it('should work with binary / masked data', (done) => {
        let wsUrl = 'ws://127.0.0.1:30000/binary_echo',
            ws = new WebSocket(wsUrl, { agent: proxyAgent(wsUrl, proxyUrl) }),
            data = new Buffer('\x00\x44\xff\xc0\x90');
        ws.on('open', () => {
            ws.send(data, { binary: true, mask: true });
            ws.on('message', (msg) => {
                assert.ok(data.equals(msg));
                ws.close();
                done();
            });
        }).on('error', (err: any) => done(err));
    });

    it('should pass headers correctly from client to server', (done) => {
        let wsUrl = 'ws://127.0.0.1:30000/header_test',
            headers: { [k: string]: string } = { 'X-Foo': 'bar' },
            ws = new WebSocket(wsUrl, { headers: headers, agent: proxyAgent(wsUrl, proxyUrl) });

        ws.on('open', () => {
            ws.on('message', (msg: string) => {
                let reflectedHeaders = JSON.parse(msg);
                assert.equal(reflectedHeaders['x-foo'], 'bar');
                ws.close();
                done();
            });
        }).on('error', (err: any) => done(err));
    });
});
