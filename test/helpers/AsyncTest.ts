
// Not bad: http://staxmanade.com/2015/11/testing-asyncronous-code-with-mochajs-and-es7-async-await/

export function asyncTest(fn: Function) {
    return async (done: (err?: any) => void) => {
        try {
            await fn();
            done();
        } catch (err) {
            done(err);
        }
    };
}
