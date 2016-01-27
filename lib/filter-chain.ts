
import * as path from 'path';
import * as os from 'os';
import * as events from 'events';
import * as fs from '@sane/fs';
import { streamToBuffer, bufferToStream, streamToFile } from './stream-adaptor';
import { randomString } from './util';

export type Filter<P, Q> = (input: P) => Promise<Q>;
export type BufferFilter = Filter<Buffer, Buffer>;
export type FileFilter = Filter<string, string>;
export type StreamFilter = Filter<NodeJS.ReadableStream, NodeJS.ReadableStream>;

class Tmp {
    tmpFiles = new Set<string>();

    register(filePath: string): string {
        this.tmpFiles.add(filePath);
        return filePath;
    }
    async spool(strm: NodeJS.ReadableStream): Promise<string> {
        let p = path.join(os.tmpdir(), 'proxytmp.' + randomString(8));
        this.register(p);
        await streamToFile(strm, p);
        return p;
    }
    async cleanup(): Promise<void> {
        for(let p of this.tmpFiles) {
            try {
                await fs.unlinkAsync(p);
            } catch(e) {}  // Ignore delete failure
        }
    }
}

export class FilterChain extends events.EventEmitter {
    private handlers: StreamFilter[] = [];
    private streamSet = new Set<NodeJS.ReadableStream>();
    private tmp = new Tmp();

    constructor() {
        super();
    }
    addFileFilter(fn: FileFilter): void {
        // Adapt FileFilter -> StreamFilter
        let wrappedHandler = async (strm: NodeJS.ReadableStream): Promise<NodeJS.ReadableStream> => {
            let inputPath = await this.tmp.spool(strm);
            let outputPath = this.tmp.register(await fn(inputPath));
            let outstrm = fs.createReadStream(outputPath);
            return outstrm;
        };
        this.handlers.push(wrappedHandler);
    }
    addBufferFilter(fn: BufferFilter): void {
        // Adapt BufferFilter -> StreamFilter
        let wrappedHandler = async (strm: NodeJS.ReadableStream): Promise<NodeJS.ReadableStream> => {
            /* tslint:disable:no-unused-variable */
            let bufP = streamToBuffer(strm);
            strm.resume(); // In case stream is not flowing
            let buf = await bufP;
            let result = await fn(buf);
            return bufferToStream(result);
            /* tslint:enable:no-unused-variable */
        };
        this.handlers.push(wrappedHandler);
    }
    addStreamFilter(fn: StreamFilter): void {
        this.handlers.push(fn);
    }
    async run(strm: NodeJS.ReadableStream): Promise<NodeJS.ReadableStream> {
        let head: NodeJS.ReadableStream = strm;
        this.forwardStreamErrors(head);
        for(let handler of this.handlers) {
            head = await handler(head);
            this.forwardStreamErrors(head);
        }
        await this.tmp.cleanup();
        return head;
    }
    private forwardStreamErrors(strm: NodeJS.ReadableStream) {
        if(!this.streamSet.has(strm)) {
            this.streamSet.add(strm);
            strm.on('error', (e: any) => this.emit('error', e));
        }
    }
}
