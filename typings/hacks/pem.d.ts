
declare module 'pem' {
    module pem_api {

        export interface CreatePrivateKeyOptions {
            cipher?: string;
            password?: string;
        }
        export interface CreatePrivateKeyResult {
            key: string;
        }
        export function createPrivateKey(
            keyBitsize: number,
            options: CreatePrivateKeyOptions,
            callback: (err: any, result: CreatePrivateKeyResult) => void
        ): void;


        export function createDhparam(
            keyBitsize: number,
            callback: (err: any, dhparam: string) => void
        ): void;

        export interface CreateCSROptions {
            clientKey: string;
            keyBitsize: number;
            hash: string;
            country: string;
            state: string;
            locality: string;
            organization: string;
            organizationUnit: string;
            commonName: string;
            emailAddress: string;
            altNames: string;
        }
        export interface CreateCSRResult {
            csr: string;
            clientKey: string;
        }
        export function createCSR(
            options: CreateCSROptions,
            callback: (err: any, result: CreateCSRResult) => void
        ): void;

        export interface CreateCertificateOptions {
            serviceKey?: string;
            selfSigned?: boolean;
            hash?: string;
            csr?: string;
            days?: number;
        }
        export interface CreateCertificateResult {
            certificate: string;
            csr: string;
            clientKey: string;
            serviceKey: string;
        }
        export function createCertificate(
            options: CreateCertificateOptions,
            callback: (err: any, result: CreateCertificateResult) => void
        ): void;

        export function getPublicKey(
            certificate: string,
            callback: (err: any, publicKey: any) => void
        ): void;

        export interface CertificateInfo {
            country: string;
            state: string;
            locality: string;
            organization: string;
            organizationUnit: string;
            commonName: string;
            emailAddress: string;
        }
        export function readCertificateInfo(
            certificate: string,
            callback: (err: any, info: CertificateInfo) => void
        ): void;

        export function getModulus(
            certificate: string,
            callback: (err: any, modulus: string) => void
        ): void;

        export function getModulusFromProtected(
            key: any,
            password: string,
            callback: (err: any, modulus: string) => void
        ): void;

        export function getFingerprint(
            certificate: string,
            hash: string,
            callback: (err: any, fingerprint: string) => void
        ): void;

        export interface ConfigOptions {
            pathOpenSSL?: string;
        }
        export function config(options: ConfigOptions): void;
    }

    export = pem_api;
}

