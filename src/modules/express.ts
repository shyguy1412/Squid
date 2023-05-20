import type { JSX } from "preact";
import type { NextFunction, Request, Response } from 'express';

import express from "express";
import { join, resolve } from "path";
import { pathToFileURL } from 'url';
import { readdir } from "fs/promises";
import { createSocket } from "dgram";

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
      if (!param) continue;
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

  const { modulePath, queryParams } = await resolveRequestURLToModulePath(req.originalUrl);

  if (!modulePath) return next();

  req.params = queryParams;

  const module = await import(pathToFileURL(modulePath).toString()) as
    {
      default: () => JSX.Element,
      h: typeof import('preact').h,
      render: typeof import('preact-render-to-string').render,
      getServerSideProps?: (req: Request, res: Response) => ServerSideProps | Promise<ServerSideProps>,
    } | {
      default: (req: Request, res: Response) => void | Promise<void>,
    };


  if ('h' in module && 'render' in module) {
    if (req.method.toLowerCase() != 'get') return next();
    const { render, h, default: App, getServerSideProps } = module;
    const serverSideProps = getServerSideProps ? await getServerSideProps(req, res) : null;
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

  module.default(req, res);
}

export default function () {
  const ipcSocket = createSocket({ type: 'udp4', reuseAddr: true });
  const IPC_PORT = 7150;
  ipcSocket.bind(IPC_PORT, 'localhost');

  ipcSocket.on("message", (msg) => {
    if (msg.toString('utf8') == 'exit')
      process.exit();
  });

  ipcSocket.send('started', IPC_PORT, 'localhost');

  return [
    express.static('./build/public'),
    hydrate,
    page,
  ];
};