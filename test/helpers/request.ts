import * as http from 'http';
import * as real_request from 'request';

export function request(opts: any, cb: any) {
    opts.json = true;
    opts.strictSSL = false;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    real_request(opts, function(err: any, res: any, body: any) {
        cb(err, body, res);
    });
}

export interface Response {
    body: any;
    res: http.IncomingMessage;
}

export function requestp(opts: any): Promise<Response> {
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
