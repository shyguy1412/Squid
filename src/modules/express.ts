import type { NextFunction, Request, Response } from 'express';
import type { FunctionComponent } from 'preact';

import express from "express";
import path from "path";
import { parse } from 'url';

//This import is handled by the Compiler
//Its a tree structure that represents the paths to the modules
//The leafs are the modules corresponsding to the path it takes to reach them
import moduleMap from "squid/pages";

export type ServerSideProps = {
  props: {
    [key: string]: string;
  };
};

export type SquidModule = {
  default: FunctionComponent<any>,
  h: typeof import('preact').h,
  render: typeof import('preact-render-to-string').render,
  getServerSideProps?: (req: Request, res: Response) => ServerSideProps | Promise<ServerSideProps>,
} | {
  default: (req: Request, res: Response) => void | Promise<void>,
};

/**
 * Returns the module for a given url
 * aswell as any query parameters in the path
 * and the path to the sourcefile of that module
 */
async function resolveRequestPathToModule(url: string) {
  const pathFragments = url.substring(1).split('/');
  const moduleFragments: string[] = [];
  const queryParams: { [key: string]: string; } = {};

  function recursiveWalk(position: typeof moduleMap | SquidModule, path: string[]): SquidModule | null {
    const node = path.shift();
    if (!node) {

      if ((Object.keys(position)).includes('index')) {
        moduleFragments.push('index');
        return (position as typeof moduleMap)['index'] as SquidModule;
      } else
        return position as SquidModule;

    }
    if ((position as typeof moduleMap)[node] == undefined) {

      const dynamicKey = Object.keys(position).find(key => /^\{.*\}$/.test(key)) ?? node;

      if (dynamicKey == node) return position as SquidModule;

      queryParams[dynamicKey.replace(/^\{(.*)\}$/, '$1')] = node;

      return ((position as typeof moduleMap)[dynamicKey]) as SquidModule;
    }

    moduleFragments.push(node);
    return recursiveWalk((position as typeof moduleMap)[node] as typeof moduleMap, path);
  }

  const module = recursiveWalk(moduleMap, pathFragments);

  if (!module) return {
    module: null,
    path: null,
    queryParams: {}
  };

  return {
    module,
    path: path.resolve(`build/pages/${moduleFragments.join('/')}.mjs`),
    queryParams
  };
}

//HYDRATE MIDDLEWARE
async function hydrate(req: Request, res: Response, next: NextFunction) {
  if (!/^\/?hydrate\/.*/.test(req.originalUrl)) return next();

  const requestPath = (parse(req.originalUrl).path ?? '').replace('/hydrate', '');
  const { module, path } = await resolveRequestPathToModule(requestPath);

  if (!module) return next();

  res.sendFile(path);
  return;
};

//PAGE MIDDLEWARE
async function page(req: Request, res: Response, next: NextFunction) {

  const requestPath = parse(req.originalUrl).path ?? '';
  const { module, queryParams } = await resolveRequestPathToModule(requestPath);

  if (!module) return next();

  Object.assign(req.params, queryParams);

  try {
    if ('h' in module && 'render' in module) {
      if (req.method.toLowerCase() != 'get') return next();

      const { render, h, default: App, getServerSideProps } = module;

      const serverSideProps = typeof getServerSideProps == 'function' ? await getServerSideProps(req, res) : null;
      const props = serverSideProps ? serverSideProps.props : {};

      const renderedHTML = '<!DOCTYPE html>\n' + render(h(App, props))
        .replace('<head>', `<head><script>window['squid-ssr-props'] = JSON.parse('${JSON.stringify(props)}');</script><script src="/hydrate.js" defer></script>`);

      res.send(renderedHTML);
      return;
    }

    module.default(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).send('Internal Server Error');
  }
}

export default function () {
  return [
    express.static('./build/public'),
    hydrate,
    page,
    express.static('./build/pages'),
  ];
};

