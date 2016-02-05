import * as assert from 'assert';
import { parse } from 'url';
import { TestServer } from './helpers/TestServer';
import { requestp } from './helpers/request';
import { asyncTest } from './helpers/AsyncTest';
import { Proxy } from '../lib/proxy';
import { RequestContext } from '../lib/http';
import { ServiceGroup } from '@sane/service';
import { promiseCallback } from '../lib/util';
import { httpOverHttp, httpsOverHttp } from 'tunnel-agent';
import * as WebSocket from 'ws';

const keepAliveValue = 'close'; // || 'keep-alive'

describe('Upstream proxy support', () => {
    var testServer = new TestServer({httpPort: 30000, httpsPort: 30001}),
        proxy1 = new Proxy({port: 30002, host: 'localhost'}),
        proxy2 = new Proxy({port: 30004, host: 'localhost', proxy: 'http://localhost:30002'}),
        services = new ServiceGroup([testServer, proxy1, proxy2]);

    before((done) => promiseCallback(services.start(), done));
    after((done) => promiseCallback(services.stop(), done));
    beforeEach(() => {
        proxy1.removeAllListeners('error');
        proxy1.clearHandlers();
        proxy2.removeAllListeners('error');
        proxy2.clearHandlers();
    });

    async function testHTTP(url: string, proxy: string) {
        let r = await requestp({
            proxy: proxy,
            url: url
        });
        let u = parse(url);
        assert.deepEqual(r.body, {
            protocol: u.protocol.replace(':', ''),
            method: 'GET',
            query: {foo: 'bar'},
            body: {},
            headers: {
                'host': u.host,
                'accept': 'application/json',
                'connection': keepAliveValue
            }
        });
    }

    function testWS(url: string, proxy: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let agent = httpOverHttp({proxy: proxy}),
                ws = new WebSocket('ws://127.0.0.1:30000/echo'),
                greeting = 'hello there!';
            ws.on('open', () => {
                ws.send(greeting);
                ws.on('message', (msg) => {
                    assert.equal(msg, greeting);
                    ws.close();
                    resolve();
                });
            }).on('error', (err:any) => reject(err));
        });
    }

    it('should work for HTTP GET via an upstream HTTP proxy', asyncTest(async () => {
        await testHTTP('http://localhost:30000/test?foo=bar', 'http://localhost:30004');
    }));

    it('should work for HTTPS GET via an upstream HTTP proxy', asyncTest(async () => {
        await testHTTP('https://localhost:30001/test?foo=bar', 'http://localhost:30004');
    }));

    it('should handle ws:// protocol through an upstream HTTP proxy', asyncTest(async () => {
        await testWS('ws://localhost:30000/echo', 'http://localhost:30004');
    }));

    it('should handle wss:// protocol through an upstream HTTP proxy', asyncTest(async () => {
        await testWS('ws://localhost:30000/echo', 'http://localhost:30004');
    }));
});
