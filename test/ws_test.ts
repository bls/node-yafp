import * as assert from 'assert';
import * as fs from '@sane/fs';
import { mochaAsync } from './helpers/mochaAsync';
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

describe('WebSocket support', function() {
    var testServer = new TestServer({httpPort: 30000, httpsPort: 30001}),
        proxy = new Proxy({port: 30002, host: 'localhost'}),
        services = new ServiceGroup([testServer, proxy]);

    beforeEach((done) => promiseCallback(services.start(), done));
    afterEach((done) => promiseCallback(services.stop(), done));
    beforeEach(() => {
        proxy.removeAllListeners('error');
        proxy.clearHandlers();
    });

    it('should work through the proxy', mochaAsync(async () => {
        // let r = await requestp({
        //     proxy: 'http://localhost:30002',
        //    url: 'http://localhost:30000/test'
        // });
        // assert.equal(r.res.statusCode, 500);
        // assert.ok(r.body.startsWith('PROXY ERROR:'));
        // assert.equal(sawError, true);
    }));

});
