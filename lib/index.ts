// Library entry point

import { RequestContext } from './engine';
import { decompressor } from './middleware/decompressor';
import { nocache } from './middleware/nocache';

export { RequestContext } from './engine';
export { Proxy, ProxyOptions } from './proxy';

export let middleware = {
    decompressor: decompressor,
    nocache: nocache
};
