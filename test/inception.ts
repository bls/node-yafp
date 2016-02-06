import * as assert from 'assert';
import { parse } from 'url';
import { TestServer } from './helpers/TestServer';
import { requestp } from './helpers/request';
import { asyncTest } from './helpers/AsyncTest';
import { Proxy } from '../lib/proxy';
import { proxyAgent } from '../lib/proxy-agent';
import { ServiceGroup } from '@sane/service';
import { promiseCallback } from '../lib/util';
import { httpOverHttp, httpsOverHttp } from 'tunnel-agent';
import * as WebSocket from 'ws';

const keepAliveValue = 'close'; // || 'keep-alive'

describe('Upstream proxy support', () => {
    var testServer = new TestServer({httpPort: 30000, httpsPort: 30001}),
        proxy1 = new Proxy({port: 30002, host: 'localhost'}),
        proxy2 = new Proxy({port: 30004, host: 'localhost', proxy: 'http://localhost:30002'}),
        proxy3 = new Proxy({port: 30006, host: 'localhost', proxy: 'https://localhost:30003'}),
        upstreamHTTP = 'http://localhost:30004',
        upstreamHTTPS = 'http://localhost:30006',
        proxies = [proxy1, proxy2, proxy3],
        services = new ServiceGroup([testServer, proxy1, proxy2, proxy3]);

    before((done) => promiseCallback(services.start(), done));
    after((done) => promiseCallback(services.stop(), done));
    beforeEach(() => {
        for(let p of proxies) {
            p.removeAllListeners('error');
            p.clearHandlers();
        }
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

    function testWS(wsUrl: string, proxy: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let agent = proxyAgent(wsUrl, proxy),
                greeting = 'hello there!';
            let ws = new WebSocket(wsUrl, { agent: agent });
            ws.on('open', () => {
                ws.send(greeting);
                ws.on('message', (msg: any) => {
                    assert.equal(msg, greeting);
                    ws.close();
                    resolve();
                });
            }).on('error', (err: any) => reject(err));
        });
    }

    it('should support HTTP GET through upstream HTTP proxy', asyncTest(async () => {
        await testHTTP('http://localhost:30000/test?foo=bar', upstreamHTTP);
    }));

    it('should support HTTPS GET through upstream HTTP proxy', asyncTest(async () => {
        await testHTTP('https://localhost:30001/test?foo=bar', upstreamHTTP);
    }));

    it('should support WS protocol through upstream HTTP proxy', asyncTest(async () => {
        await testWS('ws://localhost:30000/echo', upstreamHTTP);
    }));

    it('should support WSS protocol through upstream HTTP proxy', asyncTest(async () => {
        await testWS('wss://localhost:30001/echo', upstreamHTTP);
    }));

    it('should support HTTP GET through  upstream HTTPS proxy', asyncTest(async () => {
        await testHTTP('http://localhost:30000/test?foo=bar', upstreamHTTPS);
    }));

    it('should support HTTPS GET through upstream HTTPS proxy', asyncTest(async () => {
        await testHTTP('https://localhost:30001/test?foo=bar', upstreamHTTPS);
    }));

    it('should support WS protocol through upstream HTTPS proxy', asyncTest(async () => {
        await testWS('ws://localhost:30000/echo', upstreamHTTPS);
    }));

    it('should support WSS protocol through upstream HTTPS proxy', asyncTest(async () => {
        await testWS('wss://localhost:30001/echo', upstreamHTTPS);
    }));

});
