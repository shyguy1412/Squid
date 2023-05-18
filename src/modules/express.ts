import type { JSX } from "preact";
import type { NextFunction, Request, Response } from 'express';

import express from "express";
import { join, resolve } from "path";
import { pathToFileURL } from 'url';
import { readdir } from "fs/promises";

type ServerSideProps = {
  props: {
    [key: string]: string;
  };
};

async function getFragmentsFromPath(dir: string) {
  try {
    return (await readdir(dir, { withFileTypes: true }))
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

    const dynamicFragment = possibleModuleFragments.filter(string => /.*\{.*\}.*/.test(string))[0];
    if (dynamicFragment) {
      const paramRegex = new RegExp(dynamicFragment.replace(/{.*?}/, '(.*)'));
      const paramKey = dynamicFragment.replace(/.*{(.*?)}.*/, '$1');
      const param = fragment.replace(paramRegex, '$1');

      moduleFragments.push(dynamicFragment);
      queryParams[paramKey] = param;
      continue;
    }

    if (index == 0 && !fragment) break;

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

//HYDRATE MIDDLEWARE
async function hydrate(req: Request, res: Response, next: NextFunction) {
  if (!/\/?hydrate\/.*/.test(req.originalUrl)) return next();

  const { modulePath } = await resolveRequestURLToModulePath(req.originalUrl.replace('/hydrate', ''));

  if (!modulePath) return next();
  res.sendFile(resolve(modulePath));

};

//PAGE MIDDLEWARE
async function page(req: Request, res: Response, next: NextFunction) {
  if (req.method.toLowerCase() != 'get') return next();

  const { modulePath, queryParams } = await resolveRequestURLToModulePath(req.originalUrl);

  if (!modulePath) return next();

  const module = await import(pathToFileURL(modulePath).toString()) as
    {
      default: () => JSX.Element,
      h: typeof import('preact').h,
      render: typeof import('preact-render-to-string').render,
      getServerSideProps?: () => ServerSideProps | Promise<ServerSideProps>,
    } | {
      default: (req: Request, res: Response) => void | Promise<void>,
    };


  if ('h' in module && 'render' in module) {
    const { render, h, default: App, getServerSideProps } = module;
    const serverSideProps = getServerSideProps ? await getServerSideProps() : null;
    const props = serverSideProps ? serverSideProps.props : {};
    const renderedHTML = render(h(App, props))
      .replace('<head>', `<head>
      <script>
        window['squid-ssr-props'] = JSON.parse('${JSON.stringify(props)}');
      </script>
      <script src="/hydrate.js" defer></script>`);

    res.send(renderedHTML);
    return;
  }

  req.params = queryParams;
  module.default(req, res);
}

export default function () {
  return [
    express.static('./build/public'),
    hydrate,
    page,
  ];
};