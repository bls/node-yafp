
import * as tls from 'tls';
import * as pem from 'pem';
import promisify = require('es6-promisify');

let createCertificateAsync = promisify(pem.createCertificate);

export type CertDataBlob = string | Buffer;

export interface Options {
    caKey: CertDataBlob;
    caCert: CertDataBlob;
    password?: string;
}

export class CertificateGenerator {
    caKey: CertDataBlob;
    caCert: CertDataBlob;
    caSerial: number = Math.floor(Date.now() / 1000);
    ctxCache = new Map<string, Promise<tls.SecureContext>>();

    constructor(options: Options) {
        this.caKey = options.caKey;
        this.caCert = options.caCert;
    }
    getCertificate(commonName: string): Promise<tls.SecureContext> {
        if(!this.ctxCache.has(commonName)) {
            // Slow path, put a promise for the cert into cache. Need to increment
            // the serial or some browsers (at least, Firefox) will complain.
            let certOptions = {
                commonName: commonName,
                serviceKey: this.caKey,
                serviceCertificate: this.caCert,
                serial: this.caSerial++,
                days: 3650
            };
            let certPromise = createCertificateAsync(certOptions).then((keys: pem.CreateCertificateResult) => {
                return tls.createSecureContext({
                    key: keys.clientKey,
                    cert: keys.certificate,
                    ca: this.caCert
                }).context;
            });
            this.ctxCache.set(commonName, certPromise);
        }
        return this.ctxCache.get(commonName);
    }
    sniffCertificate(hostname: string): Promise<tls.SecureContext> {
        // Create a quick tls connection to the specified host/port combo
        // and get the certificate.
        return new Promise<tls.SecureContext>((resolve, reject) => {
            reject(new Error('Not implemented, sorry :('));
        });
    }
}
