
declare module 'tunnel-agent' {
    import * as events from 'events';

    export interface Options {
        proxy?: string;
        proxyAuth?: string;
        maxSockets?: number;
    }

    export class TunnelingAgent extends events.EventEmitter {}

    export function httpOverHttp(options: Options): TunnelingAgent;
    export function httpsOverHttp(options: Options): TunnelingAgent;
    export function httpOverHttps(options: Options): TunnelingAgent;
    export function httpsOverHttps(options: Options): TunnelingAgent;
}
