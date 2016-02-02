// Library entry point

import { RequestContext } from './http';
import { decompressor } from './middleware/decompressor';
import { nocache } from './middleware/nocache';

export { RequestContext } from './http';
export { Proxy, ProxyOptions } from './proxy';

export let middleware = {
    decompressor: decompressor,
    nocache: nocache
};
