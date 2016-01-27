import * as http from 'http';
import * as real_request from 'request';

export function request(opts, cb) {
    opts.json = true;
    opts.strictSSL = false;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    real_request(opts, function(err, res, body) {
        cb(err, body, res);
    });
}

interface Response {
    body: any;
    res: http.IncomingMessage;
}

export function requestp(opts): Promise<Response> {
    return new Promise((resolve, reject) => {
        opts.json = true;
        opts.strictSSL = false;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        real_request(opts, (err: any, res: http.IncomingMessage, body: any) => {
            if(err) {
                reject(err);
            } else {
                resolve({ res: res, body: body });
            }
        });
    });
}
