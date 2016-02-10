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
import { bufferToStream } from '../lib/stream-adaptor';

async function sayHello(data: NodeJS.ReadableStream): Promise<NodeJS.ReadableStream> {
    data.resume(); // Throw away original stream...
    return bufferToStream(new Buffer('hello there'));
}

describe('Middleware', () => {
    var testServer = new TestServer({httpPort: 30000, httpsPort: 30001}),
        proxy = new Proxy({port: 30002, host: 'localhost'}),
        proxyUrl = 'http://localhost:30002',
        services = new ServiceGroup([testServer, proxy]);

    before((done) => promiseCallback(services.start(), done));
    after((done) => promiseCallback(services.stop(), done));
    beforeEach(() => {
        proxy.removeAllListeners('error');
        proxy.clearHandlers();
    });

    it('should support middleware', asyncTest(async () => {
        proxy.addHandler((ctx: RequestContext) => ctx.withResponseStream(sayHello));
        let r = await requestp({
            proxy: proxyUrl,
            url: 'http://localhost:30000/test'
        });
        assert.equal(r.body, 'hello there');
    }));

    it('should be able to decompress responses', asyncTest(async () => {
        proxy.addHandler(decompressor);
        proxy.addHandler((ctx: RequestContext) => {
            ctx.withResponseBuffer(async (data: Buffer): Promise<Buffer> => {
                assert.equal(data.toString(), 'gzip is working');
                return data;
            });
        });
        let r = await requestp({
            proxy: proxyUrl,
            url: 'http://localhost:30000/gzip-working'
        });
        assert.equal(r.body, 'gzip is working');
    }));

    it('should not crash on decompression errors', asyncTest(async () => {
        let sawError = false;
        proxy.addHandler(decompressor);
        proxy.on('error', (e: any) => sawError = true);
        let r = await requestp({
            proxy: proxyUrl,
            url: 'http://localhost:30000/gzip-busted'
        });
        assert.equal(sawError, true);
        assert.equal(r.res.statusCode, 500);
        assert.equal(r.body.indexOf('PROXY ERROR:'), 0);
    }));

    it('should handle buffer transforms', asyncTest(async () => {
    }));

    it('should handle file transforms', asyncTest(async () => {
    }));

    it('should handle stream transforms', asyncTest(async () => {
    }));

    it('should handle multiple transforms', asyncTest(async () => {
        proxy.addHandler((ctx: RequestContext) => {
            ctx.withResponseStream(sayHello);
            ctx.withResponseFile(async (path: string): Promise<string> => {
                let tmpPath = '/tmp/testing123';
                let data = await fs.readFileAsync(path, 'utf8');
                assert.equal(data.toString(), 'hello there');
                await fs.writeFileAsync(tmpPath, 'from a file');
                return tmpPath;
            });
            ctx.withResponseBuffer(async (data: Buffer): Promise<Buffer> => {
                assert.equal(data.toString(), 'from a file');
                return new Buffer('from a buffer');
            });
        });
        let r = await requestp({
            proxy: proxyUrl,
            url: 'http://localhost:30000/test'
        });
        assert.equal(r.body, 'from a buffer');
    }));

    it('should be possible to change request headers', asyncTest(async () => {
        proxy.addHandler((ctx) => {
            ctx.withRequest((req) => {
                delete req.headers['x-foo'];
                req.headers['x-bar'] = 'yep';
            });
        });
        let r = await requestp({
            proxy: proxyUrl,
            url: 'http://localhost:30000/test',
            headers: { 'x-foo': 'deleteme' }
        });
        assert.ok(typeof r.body.headers['x-foo'] === 'undefined');
        assert.equal(r.body.headers['x-bar'], 'yep');
    }));

    it('should be possible to change response headers', asyncTest(async () => {
        proxy.addHandler((ctx) => {
            ctx.withResponse((resp) => {
                delete resp.headers['x-custom'];
                resp.headers['x-added'] = 'sure';
            });
        });
        let r = await requestp({
            proxy: proxyUrl,
            url: 'http://localhost:30000/custom-headers'
        });
        assert.ok(typeof r.res.headers['x-custom'] === 'undefined');
        assert.equal(r.res.headers['x-added'], 'sure');
        assert.equal(r.res.headers['x-multi'], 'value1, value2');
    }));

    it('should handle broken request transforms', asyncTest(async () => {
        let sawError = false;
        proxy.on('error', (e: any) => sawError = true);
        proxy.addHandler(async (ctx: RequestContext) => {
            ctx.withRequestStream(async (strm): Promise<NodeJS.ReadableStream> => {
                throw new Error('oops');
            });
        });
        let r = await requestp({
            proxy: proxyUrl,
            url: 'http://localhost:30000/test'
        });
        assert.equal(r.res.statusCode, 500);
        assert.ok(r.body.startsWith('PROXY ERROR:'));
        assert.equal(sawError, true);
    }));
    
    it('should handle broken response transforms', asyncTest(async () => {
        let sawError = false;
        proxy.on('error', (e: any) => sawError = true);
        proxy.addHandler(async (ctx: RequestContext) => {
            ctx.withResponseStream(async (strm): Promise<NodeJS.ReadableStream> => {
                throw new Error('oops');
            });
        });
        let r = await requestp({
            proxy: proxyUrl,
            url: 'http://localhost:30000/test'
        });
        assert.equal(r.res.statusCode, 500);
        assert.ok(r.body.startsWith('PROXY ERROR:'));
        assert.equal(sawError, true);
    }));
});
