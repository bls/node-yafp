import * as assert from 'assert';
import * as fs from '@sane/fs';
import { mochaAsync } from './helpers/mochaAsync';
import { TestServer } from './helpers/TestServer';
import { requestp } from './helpers/request';
import { Proxy } from '../../lib/proxy';
import { RequestContext } from '../../lib/engine';
import { ServiceGroup } from '@sane/service';
import { decompressor } from '../../lib/middleware/decompressor';
import { promiseCallback } from '../../lib/util';
import { bufferToStream } from '../../lib/stream-adaptor';

async function sayHello(data: NodeJS.ReadableStream): Promise<NodeJS.ReadableStream> {
    data.resume(); // Throw away original stream...
    return bufferToStream(new Buffer('hello there'));
}

describe('middleware', function() {
    var testServer = new TestServer({httpPort: 30000, httpsPort: 30001}),
        proxy = new Proxy({port: 30002, host: 'localhost'}),
        services = new ServiceGroup([testServer, proxy]);

    beforeEach((done) => promiseCallback(services.start(), done));
    afterEach((done) => promiseCallback(services.stop(), done));
    beforeEach(() => {
        proxy.removeAllListeners('error');
        proxy.clearHandlers();
    });

    it('should support middleware', mochaAsync(async () => {
        proxy.addHandler((ctx: RequestContext) => ctx.withResponseStream(sayHello));
        let r = await requestp({
            proxy: 'http://localhost:30002',
            url: 'http://localhost:30000/test'
        });
        assert.equal(r.body, 'hello there');
    }));

    it('should be able to decompress responses', mochaAsync(async () => {
        proxy.addHandler(decompressor);
        proxy.addHandler((ctx: RequestContext) => {
            ctx.withResponseBuffer(async (data: Buffer): Promise<Buffer> => {
                assert.equal(data.toString(), 'gzip is working');
                return data;
            });
        });
        let r = await requestp({
            proxy: 'http://localhost:30002',
            url: 'http://localhost:30000/gzip-working'
        });
        assert.equal(r.body, 'gzip is working');
    }));

    it('should not crash on decompression errors', mochaAsync(async () => {
        let sawError = false;
        proxy.addHandler(decompressor);
        proxy.on('error', e => sawError = true);
        let r = await requestp({
            proxy: 'http://localhost:30002',
            url: 'http://localhost:30000/gzip-busted'
        });
        assert.equal(sawError, true);
        assert.equal(r.res.statusCode, 500);
        assert.equal(r.body.indexOf('PROXY ERROR:'), 0);
    }));

    it('should handle buffer transforms', mochaAsync(async () => {
    }));

    it('should handle file transforms', mochaAsync(async () => {
    }));

    it('should handle stream transforms', mochaAsync(async () => {
    }));

    it('should handle multiple transforms', mochaAsync(async () => {
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
            proxy: 'http://localhost:30002',
            url: 'http://localhost:30000/test'
        });
        assert.equal(r.body, 'from a buffer');
    }));

    it('should handle broken request transforms', mochaAsync(async () => {
        let sawError = false;
        proxy.on('error', e => sawError = true);
        proxy.addHandler(async (ctx: RequestContext) => {
            ctx.withRequestStream(async (strm): Promise<NodeJS.ReadableStream> => {
                throw new Error('oops');
            });
        });
        let r = await requestp({
            proxy: 'http://localhost:30002',
            url: 'http://localhost:30000/test'
        });
        assert.equal(r.res.statusCode, 500);
        assert.ok(r.body.startsWith('PROXY ERROR:'));
        assert.equal(sawError, true);
    }));

    it('should handle broken response transforms', mochaAsync(async () => {
        let sawError = false;
        proxy.on('error', e => sawError = true);
        proxy.addHandler(async (ctx: RequestContext) => {
            ctx.withResponseStream(async (strm): Promise<NodeJS.ReadableStream> => {
                throw new Error('oops');
            });
        });
        let r = await requestp({
            proxy: 'http://localhost:30002',
            url: 'http://localhost:30000/test'
        });
        assert.equal(r.res.statusCode, 500);
        assert.ok(r.body.startsWith('PROXY ERROR:'));
        assert.equal(sawError, true);
    }));
});
