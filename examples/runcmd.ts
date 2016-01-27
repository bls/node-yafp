
import * as proxy from '../lib/index';
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

let p = new proxy.Proxy({port: 6666});
p.addHandler(proxy.middleware.nocache);
p.addHandler(proxy.middleware.decompressor);
p.addHandler((ctx) => {
    ctx.withResponseFile(async (path: string): Promise<string> => {
        let r = await pexec(`/usr/bin/file ${path}`);
        console.log(r.stdout.toString());
        return path;
    });
});
p.on('error', (e: any) => {
    console.log(e);
});
p.start();
