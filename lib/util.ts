// Misc utils

import * as crypto from 'crypto';

// Adapt a promise to a callback
export function promiseCallback<T>(p: Promise<T>, cb: (err: any, result?: T) => void): void {
    p.then((result: T) => cb(null, result))
        .catch((err: any) => cb(err));
}

// Generate a random string of length n. Note: distribution of characters won't be even.
export function randomString(n: number): string {
    let charset = 'abcdefghijklmnopqrstuvwxyz0123456789',
        buf = crypto.randomBytes(n),
        s = '';
    for (let i = 0; i < buf.length; i++) {
        var index = buf.readUInt8(i) % charset.length;
        s += charset.charAt(index);
    }
    return s;
}
