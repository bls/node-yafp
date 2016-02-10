
import * as assert from 'assert';
import * as tls from 'tls';
import * as net from 'net';
import { TestServer } from './helpers/TestServer';
import { Proxy } from '../lib/proxy';
import { ServiceGroup } from '@sane/service';
import { promiseCallback } from '../lib/util';

describe('Edge cases', () => {
    var testServer = new TestServer({httpPort: 30000, httpsPort: 30001}),
        proxy = new Proxy({port: 30002, host: 'localhost'}),
        services = new ServiceGroup([testServer, proxy]);

    beforeEach((done) => promiseCallback(services.start(), done));
    afterEach((done) => promiseCallback(services.stop(), done));

    /*

    it('should handle HTTPS requests with no host header', (done) => {

    });

    it('should handle HTTP 0.9 CONNECT with HTTP/0.9 payload', (done) => {
        let s = new net.Socket();
        s.connect(30002, '127.0.0.1', () => {
            s.write('CONNECT localhost:30002\r\n\r\n');
            setTimeout(() => {
                console.log(s.read().toString());
                s.write('GET /\r\n\r\n');
                setTimeout(() => {
                    console.log(s.read().toString());
                    done();
                }, 250);
            }, 250);
        });
    });


    it('should handle HTTP 0.9 CONNECT with HTTP/1.0 payload', (done) => {
        let s = new net.Socket();
        s.connect(30002, '127.0.0.1', () => {
            s.write('CONNECT localhost:30002\r\n\r\n');
            setTimeout(() => {
                console.log(s.read().toString());
                s.write('GET / HTTP/1.0\r\n\r\n');
                setTimeout(() => {
                    console.log(s.read().toString());
                    done();
                }, 250);
            }, 250);
        });
    });

    */

    it('should handle HTTP 0.9 CONNECT over HTTP, with HTTP/1.1 payload', (done) => {
        let s = new net.Socket();
        s.connect(30002, '127.0.0.1', () => {
            s.write('CONNECT localhost:30002\r\n\r\n');
            s.once('readable', () => {
                assert.ok(s.read().toString().indexOf('200 Connection established') !== -1);
                s.write('GET /test HTTP/1.1\r\nHost: localhost:30000\r\n\r\n');
                s.once('readable', () => {
                    assert.ok(s.read().toString().indexOf('HTTP/1.1 200 OK') === 0);
                    done();
                });
            });
        });
    });

    it('should handle HTTP 0.9 CONNECT over HTTPS, with HTTP 1.0 payload (no host header)', (done) => {
        let s = tls.connect(30003, '127.0.0.1', { rejectUnauthorized: false }, () => {
            s.write('CONNECT localhost:30002\r\n\r\n');
            s.once('readable', () => {
                assert.ok(s.read().toString().indexOf('200 Connection established') !== -1);

                // TODO: upgrade to TLS socket(!!!!)
                /*
                s.write('GET /test HTTP/1.0\r\n\r\n');
                s.once('readable', () => {
                    console.log(s.read().toString());
                    assert.ok(s.read().toString().indexOf('HTTP/1.0 200 OK') === 0);
                    done();
                });
                */
                s.end();  // TODO: this is required ...
                done();
            });
        });
    });

    it('should handle HTTP 0.9 CONNECT over HTTPS, with HTTP 1.1 payload', (done) => {
        let s = tls.connect(30003, '127.0.0.1', { rejectUnauthorized: false }, () => {
            s.write('CONNECT localhost:30002\r\n\r\n');
            s.once('readable', () => {
                assert.ok(s.read().toString().indexOf('200 Connection established') !== -1);
                s.write('GET /test HTTP/1.1\r\nHost: localhost:30000\r\n\r\n');
                s.once('readable', () => {
                    assert.ok(s.read().toString().indexOf('HTTP/1.1 200 OK') === 0);
                    done();
                });
            });
        });
    });

    /*
    it('should handle HTTP 1.0 CONNECT requests with no host header', (done) => {
        let s = new net.Socket();
        s.connect(30002, '127.0.0.1', () => {
            s.write('CONNECT localhost:30002 HTTP/1.0\r\n\r\n');
            s.write('GET / HTTP/1.0\r\n\r\n');
            setTimeout(() => {
                console.log(s.read().toString());
                setTimeout(() => {
                    console.log(s.read().toString());
                    done();
                }, 250);
            }, 250);
        });
    });
    */

});

