import * as assert from 'assert';
import * as fs from '@sane/fs';
import { asyncTest } from './helpers/AsyncTest';
import { TestServer } from './helpers/TestServer';
import { requestp } from './helpers/request';
import { Proxy } from '../lib/proxy';
import { RequestContext } from '../lib/http';
import { ServiceGroup } from '@sane/service';
import { decompressor } from '../lib/middleware/decompressor';
import { promiseCallback } from '../lib/util';
import { httpOverHttp, httpsOverHttp } from 'tunnel-agent';
import * as WebSocket from 'ws';

describe('WebSocket proxy', () => {
    var testServer = new TestServer({httpPort: 30000, httpsPort: 30001}),
        proxy = new Proxy({port: 30002, host: 'localhost'}),
        services = new ServiceGroup([testServer, proxy]);

    beforeEach((done) => promiseCallback(services.start(), done));
    afterEach((done) => promiseCallback(services.stop(), done));
    beforeEach(() => {
        proxy.removeAllListeners('error');
        proxy.clearHandlers();
    });

    it('should work through the proxy', (done) => {
        let agent = httpOverHttp({ proxy: 'http://localhost:30002' }),
            ws = new WebSocket('ws://127.0.0.1:30000/echo'),
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

    it('should work through the proxy with tls', (done) => {
        let agent = httpsOverHttp({ proxy: 'http://localhost:30002' }),
            ws = new WebSocket('wss://127.0.0.1:30001/echo'),
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
        let agent = httpOverHttp({ proxy: 'http://localhost:30002' }),
            ws = new WebSocket('ws://127.0.0.1:30000/blast'),
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
        let agent = httpOverHttp({ proxy: 'http://localhost:30002' }),
            ws = new WebSocket('ws://127.0.0.1:30000/binary_echo'),
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
        let agent = httpOverHttp({ proxy: 'http://localhost:30002' }),
            headers: { [k: string]: string } = { 'X-Foo': 'bar' },
            ws = new WebSocket('ws://127.0.0.1:30000/header_test', { headers: headers });
        ws.on('open', () => {
            ws.on('message', (msg: string) => {
                let reflectedHeaders = JSON.parse(msg);
                assert.equal(reflectedHeaders['x-foo'], 'bar');
                ws.close();
                done();
            });
        }).on('error', (err: any) => done(err));
    });



    // TODO: verify that headers from 'ugprade' request are passed to the server properly

});
