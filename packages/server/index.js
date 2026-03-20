const os = require('node:os');
const path = require('node:path');

const Application = require('thinkjs');
const Loader = require('thinkjs/lib/loader');

module.exports = function main(configParams = {}) {
  const { env, ...config } = configParams;

  // `__dirname` is not injected by esbuild when bundling for Cloudflare
  // Workers (browser/worker target).  Fall back to process.cwd() so that
  // the ThinkJS application can locate its source tree in `wrangler dev`
  // (local dev), and still satisfies the non-empty ROOT_PATH assertion in
  // deployed Workers (where filesystem access fails gracefully anyway).
  // eslint-disable-next-line no-undef
  const baseDir = (typeof __dirname !== 'undefined' && __dirname) || process.cwd();

  const app = new Application({
    ROOT_PATH: baseDir,
    APP_PATH: path.join(baseDir, 'src'),
    VIEW_PATH: path.join(baseDir, 'view'),
    RUNTIME_PATH: path.join(os.tmpdir(), 'runtime'),
    proxy: true, // use proxy
    env: env || 'vercel',
  });

  const loader = new Loader(app.options);

  loader.loadAll('worker');

  // oxlint-disable-next-line func-names
  return function (req, res) {
    for (const key in config) {
      // fix https://github.com/walinejs/waline/issues/2649 with alias model config name
      think.config(key === 'model' ? 'customModel' : key, config[key]);
    }

    return think
      .beforeStartServer()
      .catch((err) => {
        think.logger.error(err);
      })
      .then(() => {
        const callback = think.app.callback();

        return callback(req, res);
      })
      .then(() => {
        think.app.emit('appReady');
      });
  };
};
