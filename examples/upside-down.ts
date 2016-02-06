// Flip images upside-down, with Jimp (https://www.npmjs.com/package/jimp)

import * as http from 'http';
import * as yafp from '../lib/index';
import promisify = require('es6-promisify');
var Jimp: any = require('jimp');

function getImageType(resp: http.IncomingMessage): string {
    let supportedImageTypes = ['image/png', 'image/jpeg', 'image/bmp'],
        contentType = (resp.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

    contentType = contentType.replace('image/jpg', 'image/jpeg');
    if(supportedImageTypes.indexOf(contentType) !== -1) {
        return contentType;
    }

    return null;
}

async function rotateImage(contentType: string, buf: Buffer): Promise<Buffer> {
    let image = await Jimp.read(buf);
    image = image.rotate(180);
    let getBuffer = promisify(image.getBuffer).bind(image);
    return getBuffer(contentType);
}

let listenPort = 6666,
    proxy = new yafp.Proxy({port: 6666});
proxy.addHandler(yafp.middleware.decompressor);
proxy.addHandler(yafp.middleware.nocache);
proxy.addHandler((ctx: yafp.RequestContext): void => {
    ctx.withResponse((resp): void => {
        let contentType = getImageType(resp);
        if(contentType) {
            ctx.withResponseBuffer(async (data: Buffer): Promise<Buffer> => {
                try {
                    let lengthBefore = data.length;
                    data = await rotateImage(contentType, data);
                    let lengthAfter = data.length;
                    console.log(`Modifying image: ${ctx.url} - ${contentType} - was ${lengthBefore} now ${lengthAfter} bytes`);
                } catch(e) {
                    console.log(`Error processing: ${ctx.url} - ${contentType}`);
                    console.log(e.stack);
                }
                resp.headers['content-length'] = data.length;
                return data;
            });
        }
    });
});
proxy.on('error', (e: any) => { console.log(e.stack); });
proxy.start().then(() => console.log(`Proxy listening on port: ${listenPort}`));


