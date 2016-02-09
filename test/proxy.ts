import * as assert from 'assert';
import { Proxy } from '../lib/proxy';
import { asyncTest } from './helpers/AsyncTest';
import { TestServer } from './helpers/TestServer';
import { requestp } from './helpers/request';
import { ServiceGroup } from '@sane/service';
import { promiseCallback } from '../lib/util';

const keepAliveValue = 'close'; // || 'keep-alive'

describe('HTTP Proxy', function() {
    var testServer = new TestServer({httpPort: 30000, httpsPort: 30001}),
        proxy = new Proxy({port: 30002, host: 'localhost'}),
        proxyUrl = 'http://localhost:30002',
        services = new ServiceGroup([testServer, proxy]);

    before((done) => promiseCallback(services.start(), done));
    after((done) => promiseCallback(services.stop(), done));

    it('should work for HTTP GET methods', asyncTest(async () => {
        let r = await requestp({
            proxy: proxyUrl,
            url: 'http://localhost:30000/test?foo=bar'
        });
        assert.deepEqual(r.body, {
            protocol: 'http',
            method: 'GET',
            query: {foo: 'bar'},
            body: {},
            headers: {
                'host': 'localhost:30000',
                'accept': 'application/json',
                'connection': keepAliveValue
            }
        });
    }));

    it('should work for HTTP POST methods', asyncTest(async () => {
        let r = await requestp({
            method: 'POST',
            form: { hello: 'world' },
            proxy: proxyUrl,
            url: 'http://localhost:30000/test?foo=bar'
        });
        assert.deepEqual(r.body, {
            protocol: 'http',
            method: 'POST',
            query: {foo: 'bar'},
            body: {hello: 'world'},
            headers: {
                'host': 'localhost:30000',
                'content-type': 'application/x-www-form-urlencoded',
                'accept': 'application/json',
                'content-length': '11',
                'connection': keepAliveValue
            }
        });
    }));

    it('should work for HTTPS GET methods', asyncTest(async () => {
        let r = await requestp({
            proxy: proxyUrl,
            url: 'https://localhost:30001/test?foo=bar'
        });
        assert.deepEqual(r.body, {
            protocol: 'https',
            method: 'GET',
            query: { foo: 'bar' },
            body: {},
            headers: {
                'host': 'localhost:30001',
                'accept': 'application/json',
                'connection': keepAliveValue
            }
        });
    }));

    it('should work for HTTPS POST methods', asyncTest(async () => {
        let r = await requestp({
            method: 'POST',
            form: {hello: 'world'},
            proxy: proxyUrl,
            url: 'https://localhost:30001/test?foo=bar'
        });
        assert.deepEqual(r.body, {
            protocol: 'https',
            method: 'POST',
            query: { foo: 'bar' },
            body: { hello: 'world' },
            headers: {
                'host': 'localhost:30001',
                'content-type': 'application/x-www-form-urlencoded',
                'accept': 'application/json',
                'content-length': '11',
                'connection': keepAliveValue
            }
        });
    }));

    it('should work for correctly for 404 responses', asyncTest(async () => {
        let r = await requestp({
            method: 'GET',
            form: { hello: 'world' },
            proxy: proxyUrl,
            url: 'https://localhost:30001/not-found'
        });
        assert.deepEqual(r.body, { status: 404 });
        assert.equal(r.res.statusCode, 404);
    }));

    it('should not follow HTTP redirects', asyncTest(async () => {
        let r = await requestp({
            method: 'GET',
            proxy: proxyUrl,
            url: 'http://localhost:30000/redirect',
            followRedirect: false
        });
        assert.equal(r.res.statusCode, 302);
    }));

    it('should handle unreachable hosts', asyncTest(async () => {
        let sawError = false;
        proxy.on('error', (e: any) => {
            sawError = true;
        });
        let r = await requestp({
            method: 'GET',
            proxy: proxyUrl,
            url: 'http://aklsjdokdjsflksdjfoisdjfoijsdf.com/'
        });
        assert.equal(r.res.statusCode, 500);
        assert.equal(sawError, true);
    }));

    it('should handle multiple request headers', asyncTest(async () => {
        let r = await requestp({
            method: 'GET',
            url: 'https://localhost:30001/test',
            proxy: proxyUrl,
            headers: {
                'X-Foo': ['bar', 'baz']
            }
        });
        assert.deepEqual(r.body, {
            protocol: 'https',
            method: 'GET',
            body: {},
            query: {},
            headers: {
                'accept': 'application/json',
                'connection': keepAliveValue,
                'host': 'localhost:30001',
                'x-foo': 'bar, baz'
            }
        });
    }));
});
