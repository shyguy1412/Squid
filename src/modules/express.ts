import express from "express";
import { join, resolve } from "path";
import { pathToFileURL } from 'url';
import { readdir } from "fs/promises";
import { JSX } from "preact";
import { ApiHandler } from "./api";
import { createSocket } from "dgram";

async function getFragmentsFromPath(dir: string) {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      // .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name.replace('.mjs', ''));
  } catch (e) { return []; }
}

async function resolveRequestURLToModulePath(url: string) {
  const pathFragments = url.substring(1).split('/');
  const moduleFragments: string[] = [];
  const queryParams: { [key: string]: string; } = {};

  for (const [index, fragment] of pathFragments.entries()) {

    const possibleModuleFragments = await getFragmentsFromPath(join('./build/pages', moduleFragments.join('/')));
    if (possibleModuleFragments.includes(fragment)) {
      moduleFragments.push(fragment);
      continue;
    }

    const dynamicFragment = possibleModuleFragments.filter(string => /\{.*\}/.test(string))[0];
    if (dynamicFragment) {
      moduleFragments.push(dynamicFragment);
      queryParams[dynamicFragment.slice(1, -1)] = fragment;
      continue;
    }

    if (index == 0) break;

    return {
      modulePath: '',
      queryParams
    };
  }

  if ((await getFragmentsFromPath(join('./build/pages', moduleFragments.join('/')))).includes('index'))
    moduleFragments.push('index');

  return {
    modulePath: './build/pages/' + moduleFragments.join('/') + '.mjs',
    queryParams
  };
}

export default function () {
  const app = express();

  // http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
  app.disable("x-powered-by");

  app.use(express.static('./build/public'));
  app.use('/hydrate/*', async (req, res, next) => {
    const { modulePath } = await resolveRequestURLToModulePath(req.originalUrl.replace('/hydrate', ''));

    if (!modulePath) {
      next();
      return;
    }

    res.sendFile(resolve(modulePath));

  });

  app.use('*', async (req, res, next) => {
    const { modulePath, queryParams } = await resolveRequestURLToModulePath(req.originalUrl);

    if (!modulePath) {
      next();
      return;
    }

    const module = await import(pathToFileURL(modulePath).toString()) as {
      default: () => JSX.Element,
      h: typeof import('preact').h,
      render: typeof import('preact-render-to-string').render;
    } | { default: ApiHandler; };

    if ('h' in module && 'render' in module) {
      const { render, h, default: App } = module;
      const renderedHTML = render(h(App, {}))
        .replace('<head>', '<head><script src="/hydrate.js" defer></script>');

      res.send(renderedHTML);
      return;
    }

    module.default(Object.assign(req, { queryParams }), res);

  });

  app.once('listening', (e) => {
    console.log(e);
    const port = 0;
    const ipcSocket = createSocket("udp4");

    // Catching the message event
    ipcSocket.on("message", function (msg) {
      app.emit('ipc', msg.toString('utf-8'));
    });

    app.on('ipc', (msg) => {
      console.log(msg);
    });

    // Binding server with port
    ipcSocket.bind(port + 1, 'localhost');
    ipcSocket.send('started', port - 1, 'localhost');
  });

  return app;
};