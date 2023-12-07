import type { NextFunction, Request, Response } from 'express';
import type { FunctionComponent } from 'preact';

import express from "express";
import path from "path";
import { parse } from 'url';
import { existsSync as fileExists } from 'fs';

//This import is handled by the Compiler
//Its a tree structure that represents the paths to the modules
//The leafs are the modules corresponsding to the path it takes to reach them
//@ts-ignore
import moduleMap from "squid/pages";

export type ServerSideProps = {
  props?: {
    [key: string]: string;
  };
  redirect?: string;
} | undefined;

export type SquidModule = {
  default: FunctionComponent<any>,
  h: typeof import('preact').h,
  render: typeof import('preact-render-to-string').render,
  // getServerSideProps?: (req: Request, res: Response) => ServerSideProps | Promise<ServerSideProps>,
} | {
  default: (req: Request, res: Response) => ServerSideProps | Promise<ServerSideProps>,
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

  function getDynamicNode(position: typeof moduleMap | SquidModule) {
    return Object.keys(position).find(key => /^\{.*\}$/.test(key)) ?? false;
  }

  function recursiveWalk(position: typeof moduleMap | SquidModule, path: string[]): { module?: SquidModule, props?: SquidModule; } {
    let node = path.shift() || 'index';
    const nextNode = path[0];
    if ((position as typeof moduleMap)[node] == undefined) {

      const dynamicNode = getDynamicNode(position);

      if (!dynamicNode) return {};

      queryParams[dynamicNode.replace(/^\{(.*)\}$/, '$1')] = node;
      node = dynamicNode;
    }

    if (!nextNode) {
      moduleFragments.push(node);

      let module = (position as typeof moduleMap)[node];

      if ((module as typeof moduleMap)['index']) {
        moduleFragments.push('index');
        module = (module as typeof moduleMap)['index'];
      }

      return {
        module: module as SquidModule,
        props: (position as typeof moduleMap)[`${node}.props`] as SquidModule,
      };

    }

    moduleFragments.push(node);
    return recursiveWalk((position as typeof moduleMap)[node] as typeof moduleMap, path);
  }

  const { module, props } = recursiveWalk(moduleMap, pathFragments);

  if (!module) return {
    module: null,
    props: null,
    path: null,
    queryParams: {}
  };

  return {
    module,
    props,
    path: path.resolve(`build/pages/${moduleFragments.join('/')}.mjs`),
    queryParams
  };
}

//STYLE MIDDLEWARE
async function style(req: Request, res: Response, next: NextFunction) {
  if (!/\?style$/.test(req.originalUrl)) return next();

  const requestPath = (parse(req.originalUrl).pathname ?? '').replace('/hydrate', '');
  const { module, path } = await resolveRequestPathToModule(requestPath);

  if (!module) return next();

  const stylePath = path.replace(/\.m?js$/, '.css');

  if (fileExists(stylePath))
    return res.sendFile(stylePath);

  return next();
};

//HYDRATE MIDDLEWARE
async function hydrate(req: Request, res: Response, next: NextFunction) {
  if (!/\?hydrate$/.test(req.originalUrl)) return next();

  const requestPath = (parse(req.originalUrl).pathname ?? '').replace('/hydrate', '');
  const { module, path } = await resolveRequestPathToModule(requestPath);

  if (!module) return next();

  res.sendFile(path);
  return;
};

//PAGE MIDDLEWARE
async function page(req: Request, res: Response, next: NextFunction) {

  const requestPath = parse(req.originalUrl).path ?? '';
  const { module, props, queryParams } = await resolveRequestPathToModule(requestPath);

  if (!module) return next();

  if (props && 'h' in props && 'render' in props) {
    throw new Error("Props should only export getSeverSideProps");
  }

  Object.assign(req.params, queryParams);

  try {
    if ('h' in module && 'render' in module) {
      if (req.method.toLowerCase() != 'get') return next();

      const { render, h, default: App } = module;
      const { default: getServerSideProps } = props ?? { getServerSideProps: undefined };
      if (getServerSideProps && typeof getServerSideProps != 'function') {
        throw new Error('ServerSideProps need to be a function');
      }
      const serverSideProps = getServerSideProps ? await getServerSideProps(req, res) : undefined;
      // const props = serverSideProps ? serverSideProps.props : {};
      // const redirect = serverSideProps ? serverSideProps.redirect : undefined;

      if (serverSideProps?.redirect) {
        return res.redirect(serverSideProps.redirect);
      }
      const renderedHTML = '<!DOCTYPE html>\n' + render(h(App, serverSideProps?.props))
        .replace('<head>', `<head><script>window['squid-ssr-props'] = JSON.parse('${JSON.stringify(serverSideProps?.props ?? {}).replaceAll('\\', '\\\\')}');</script><script src="/hydrate.js" defer></script>`);

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
    style,
    hydrate,
    page,
    express.static('./build/pages'),
  ];
};

