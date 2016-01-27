
export { Proxy, ProxyOptions } from './proxy';
export { RequestContext } from './engine';

import { decompressor } from './middleware/decompressor';
import { nocache } from './middleware/nocache';

export let middleware = {
    decompressor: decompressor,
    nocache: nocache
};
