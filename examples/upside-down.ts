
import * as http from 'http';
import * as proxy from '../lib/index';
import promisify = require('es6-promisify');
var Jimp: any = require('jimp');

function getImageType(resp: http.IncomingMessage): string {
    let supportedImageTypes = ['image/png', 'image/jpeg', 'image/bmp'],
        contentType = resp.headers['content-type'] || '';

    contentType = contentType.split(';')[0].trim().toLowerCase();
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

let p = new proxy.Proxy({port: 6666});
p.addHandler(proxy.middleware.decompressor);
p.addHandler(proxy.middleware.nocache);
p.addHandler((ctx: proxy.RequestContext): void => {
    let reqUrl: string;
    ctx.withRequest((req): void => {
        reqUrl = req.headers['host'] + req.url;
    });
    ctx.withResponse((resp): void => {
        let contentType = getImageType(resp);
        if(contentType !== null) {
            console.log(`Modifying image: ${reqUrl} - ${contentType}`);
            ctx.withResponseBuffer(async (data: Buffer): Promise<Buffer> => {
                try {
                    console.log(`Image was: ${data.length} bytes...`);
                    data = await rotateImage(contentType, data);
                    console.log(`Image is now: ${data.length} bytes...`);
                } catch(e) {
                    console.log(`Image processing error: ${e}`);
                }
                resp.headers['content-length'] = data.length;
                return data;
            });
        }
    });
});
p.on('error', (e: any) => {
    console.log(e);
});
p.start();
