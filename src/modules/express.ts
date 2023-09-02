import type { NextFunction, Request, Response } from 'express';
import type { FunctionComponent, JSX } from 'preact';

import express from "express";
import path from "path";
import { parse } from 'url';

//This import is handled by the Compiler
import moduleMap from "squid/pages";

const PAGES_DIR = './build/pages/';

const hydrationSnippet = `async function hydrate(){
  // document.body.remove();
  console.log(document.body);
  const a="./hydrate"+window.location.pathname;
  const {default:App,h,hydrate}=await import(a);
  hydrate(h(App,{...window["squid-ssr-props"]??{}}),document)
}
hydrate();`;

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

async function resolveRequestPathToModule(url: string, basedir: string) {
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
      if (dynamicKey == node) position as SquidModule;
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
  if (!/\/?hydrate\/.*/.test(req.originalUrl)) return next();

  const requestPath = (parse(req.originalUrl).path ?? '').replace('/hydrate', '');
  const { module, path } = await resolveRequestPathToModule(requestPath, PAGES_DIR);

  if (!module) return next();

  res.sendFile(path);
  return;
};

//PAGE MIDDLEWARE
async function page(req: Request, res: Response, next: NextFunction) {

  const requestPath = parse(req.originalUrl).path ?? '';
  const { module, queryParams, path } = await resolveRequestPathToModule(requestPath, PAGES_DIR);

  if (!module) return next();

  Object.assign(req.params, queryParams);

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
}

export default function () {
  return [
    express.static('./build/public'),
    hydrate,
    page,
    express.static('./build/pages'),
  ];
};

