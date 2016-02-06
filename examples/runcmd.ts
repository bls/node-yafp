// Run the UNIX 'file' command on every http response

import * as yafp from '../lib/index';
import { exec } from 'child_process';

interface ExecResult {
    stdout: Buffer;
    stderr: Buffer;
}

function pexec(cmd: string): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        exec(cmd, (err: any, stdout: Buffer, stderr: Buffer) => {
            if(err) {
                console.log(err.stack);
                reject(err);
            } else {
                resolve({
                    stdout: stdout,
                    stderr: stderr
                });
            }
        });
    });
}

let listenPort = 6666,
    proxy = new yafp.Proxy({port: listenPort});

proxy.addHandler(yafp.middleware.nocache);
proxy.addHandler(yafp.middleware.decompressor);

proxy.addHandler((ctx) => {
    ctx.withResponseFile(async (path: string): Promise<string> => {
        let r = await pexec(`/usr/bin/file -b ${path}`);
        console.log(`${ctx.url} -> ${r.stdout.toString().trim()}`);
        return path;
    });
});

proxy.on('error', (e: any) => { console.log(e.stack); });
proxy.start().then(() => console.log(`Proxy listening on port: ${listenPort}`));
