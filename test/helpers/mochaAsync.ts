
// Not bad: http://staxmanade.com/2015/11/testing-asyncronous-code-with-mochajs-and-es7-async-await/

export function mochaAsync(fn: Function) {
    return async (done) => {
        try {
            await fn();
            done();
        } catch (err) {
            done(err);
        }
    };
}
