import type { NextFunction, Request, Response } from 'express';
import type { FunctionComponent } from 'preact';

import express from "express";
import path from "path";
import { parse } from 'url';
import { existsSync as fileExists } from 'fs';
import { SquidModuleMap } from '@/modules/Pages';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
export type ServerSideProps = {
  props?: {
    [key: string]: string;
  };
  redirect?: string;
} | undefined;

export type SquidModule = {
  default: FunctionComponent<any>,
  getServerSideProps?: (req: Request, res: Response) => ServerSideProps | Promise<ServerSideProps>;
  api: false,
} | {
  default: (req: Request, res: Response) => void | Promise<void>,
  api: true;
};

/**
 * Returns the module for a given url
 * aswell as any query parameters in the path
 * and the path to the sourcefile of that module
 */
async function resolveRequestPathToModule(url: string, moduleMap: SquidModuleMap) {
  const pathFragments = url.substring(1).split('/');
  const moduleFragments: string[] = [];
  const queryParams: { [key: string]: string; } = {};

  function getDynamicNode(position: SquidModuleMap | SquidModule) {
    return Object.keys(position).find(key => /^\{.*\}$/.test(key)) ?? false;
  }

  function recursiveWalk(position: SquidModuleMap | SquidModule, path: string[]): { module?: SquidModule, props?: SquidModule; } {
    let node = path.shift() || 'index';
    const nextNode = path[0];
    if ((position as SquidModuleMap)[node] == undefined) {

      const dynamicNode = getDynamicNode(position);

      if (!dynamicNode) return {};

      queryParams[dynamicNode.replace(/^\{(.*)\}$/, '$1')] = node;
      node = dynamicNode;
    }

    if (!nextNode) {
      moduleFragments.push(node);

      let module = (position as SquidModuleMap)[node];

      if ((module as SquidModuleMap)['index']) {
        moduleFragments.push('index');
        module = (module as SquidModuleMap)['index'];
      }

      return {
        module: module as SquidModule,
      };

    }

    moduleFragments.push(node);
    return recursiveWalk((position as SquidModuleMap)[node] as SquidModuleMap, path);
  }

  const { module, props } = recursiveWalk(moduleMap, pathFragments);

  if (!module) return {
    module: null,
    path: null,
    queryParams: {}
  };

  return {
    module,
    path: path.resolve(`build/pages/${moduleFragments.join('/')}.js`),
    queryParams
  };
}

//STYLE MIDDLEWARE
function style(moduleMap: SquidModuleMap) {
  return async function (req: Request, res: Response, next: NextFunction) {
    if (!/\?style$/.test(req.originalUrl)) return next();

    const requestPath = (parse(req.originalUrl).pathname ?? '').replace('/hydrate', '');
    const { module, path } = await resolveRequestPathToModule(requestPath, moduleMap);

    if (!module) return next();

    const stylePath = path.replace(/\.m?js$/, '.css');

    if (fileExists(stylePath))
      return res.sendFile(stylePath);

    return next();
  };
};

//HYDRATE MIDDLEWARE
function hydrate(moduleMap: SquidModuleMap) {
  return async function (req: Request, res: Response, next: NextFunction) {
    if (!/\?hydrate$/.test(req.originalUrl)) return next();

    const requestPath = (parse(req.originalUrl).pathname ?? '').replace('/hydrate', '');
    const { module, path } = await resolveRequestPathToModule(requestPath, moduleMap);

    if (!module) return next();

    res.sendFile(path);
    return;
  };
};

//PAGE MIDDLEWARE
function page(moduleMap: SquidModuleMap) {
  return async function (req: Request, res: Response, next: NextFunction) {

    const requestPath = parse(req.originalUrl).path ?? '';
    const { module, queryParams } = await resolveRequestPathToModule(requestPath, moduleMap);

    if (!module) return next();

    Object.assign(req.params, queryParams);

    try {
      if (module.api) {
        const { default: handler } = module;
        await handler(req, res);
        return;
      }

      if (req.method.toLowerCase() != 'get') return next();

      const { default: App, getServerSideProps } = module;
      // const { default: getServerSideProps } = props ?? { getServerSideProps: undefined };
      if (getServerSideProps && typeof getServerSideProps != 'function') {
        throw new Error('ServerSideProps need to be a function');
      }

      const serverSideProps = getServerSideProps ? await getServerSideProps(req, res) : undefined;

      if (serverSideProps?.redirect) {
        return res.redirect(serverSideProps.redirect);
      }

      const serialized_props = JSON.stringify(serverSideProps?.props).replaceAll('\\', '\\\\');

      const renderedHTML = '<!DOCTYPE html>\n' + render(h(App, {}))
        .replace('<head>', `<head>
          <script>
          
          (async () => {
            const appPath = window.location.pathname + "?hydrate";
            const { default: App, h, hydrate } = await import(appPath);
            hydrate(h(App, JSON.parse('${serialized_props}')), document.body);
          })();
          
          </script>`);

      res.send(renderedHTML);
      return;

      // module.default(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).send('Internal Server Error');
    }
  };
}

export default function (moduleMap: SquidModuleMap) {
  return [
    express.static('./build/public'),
    style(moduleMap),
    hydrate(moduleMap),
    page(moduleMap),
    express.static('./build/pages'),
  ];
};

