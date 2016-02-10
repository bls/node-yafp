// Library entry point

import { RequestContext } from './http-handler';
import { decompressor } from './middleware/decompressor';
import { nocache } from './middleware/nocache';
import { serveCert } from './middleware/serve-cert';

export { RequestContext } from './http-handler';
export { Proxy } from './proxy';
export { ProxyOptions } from './proxy-options';

export let middleware = {
    decompressor: decompressor,
    nocache: nocache,
    serveCert: serveCert
};
