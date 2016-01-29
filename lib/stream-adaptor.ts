// Utils for converting between buffers and streams and named files and so on.

import * as stream from 'stream';
import * as fs from 'fs';

// Promise to collect a stream into a buffer; promise resolves when the stream ends.
export function streamToBuffer(strm: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        let parts: Buffer[] = [];
        strm.on('error', (e: any) => reject(e));
        strm.on('data', (buf: Buffer) => parts.push(buf));
        strm.on('end', () => resolve(Buffer.concat(parts)));
        strm.resume(); // In case stream was paused
    });
}

// Readable stream, backed by an internal buffer.
class ReadableBufferStream extends stream.Readable {
    offset: number = 0;
    buf: Buffer;

    constructor(buf: Buffer) {
        super();
        this.buf = buf;
    }
    _read(size?: number): void {
        let avail = this.buf.length - this.offset;
        if(avail === 0) {
            this.push(null); // EOF
        } else {
            let readSize = +size > avail ? avail : size;
            this.push(this.buf.slice(this.offset, this.offset + readSize));
            this.offset += readSize;
        }
    }
}

// Create a readable stream from a Buffer.
export function bufferToStream(buf: Buffer): NodeJS.ReadableStream {
    return new ReadableBufferStream(buf);
}

// Promise to write a stream to a file; promise resolves when file is written.
export function streamToFile(strm: NodeJS.ReadableStream, path: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let wstrm = fs.createWriteStream(path);
        wstrm.on('finish', () => resolve());
        wstrm.on('error', (e: any) => reject(e));
        strm.pipe(wstrm);
    });
}

// A transform stream which doesn't transform!
export class PassthroughStream extends stream.Transform {
    constructor() {
        super();
    }
    _transform(data: Buffer, encoding: string, callback: Function): void {
        callback(null, data);
    }
}
