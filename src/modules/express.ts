import express from "express";
import { basename, resolve, join } from "path";
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { Response, Request } from "express-serve-static-core";
import { readdir, readFile } from "fs/promises";
import { JSX } from "preact";
import { ApiHandler } from "./api";

async function getFragmentsFromPath(dir: string) {
  return (await readdir(dir, { withFileTypes: true }))
    // .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name.replace('.mjs', ''));
}

async function resolveRequestURLToModulePath(url: string) {
  const pathFragments = url.substring(1).split('/');
  const moduleFragments: string[] = [];
  const queryParams: { [key: string]: string; } = {};

  for (const fragment of pathFragments) {
    const possibleModuleFragments = await getFragmentsFromPath(join('./build/pages', moduleFragments.join('/')));
    if (possibleModuleFragments.includes(fragment)) {
      moduleFragments.push(fragment);
      continue;
    }

    const dynamicFragment = possibleModuleFragments.filter(string => /\{.*\}/.test(string))[0];
    if (dynamicFragment) {
      moduleFragments.push(dynamicFragment);
      queryParams[dynamicFragment.slice(1, -1)] = fragment;
    }
  }

  return {
    modulePath: './build/pages/' + moduleFragments.join('/') + '.mjs',
    queryParams
  };
}

export default function () {
  const app = express();

  // http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
  app.disable("x-powered-by");

  function isStaticRequest(path: string) {
    const pathFragments = path.split('/');
    return (/.*\..+/).test(pathFragments[pathFragments.length - 1]);
  }

  async function serveStatic(req: Request, res: Response) {
    const staticPath = './build' + req.originalUrl;

    if (!existsSync(staticPath)) {
      res.status(404);
      res.send('Static content not found: ' + resolve(staticPath));
      return;
    }

    res.contentType(basename(staticPath).replaceAll('.mjs', '.js'));
    res.send(await readFile(staticPath));
  }


  app.get('/*', async (req, res) => {
    if (isStaticRequest(req.originalUrl)) {
      await serveStatic(req, res);
      return;
    }

    // const appPath = (await glob(`build/pages/${req.originalUrl}{/index.mjs,.mjs}`))[0];
    const { modulePath, queryParams } = await resolveRequestURLToModulePath(req.originalUrl);

    if (!existsSync(modulePath)) {
      res.status(404);
      res.send('Page not found: ' + modulePath);
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
  return app;
};