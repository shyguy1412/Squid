import { SquidOptions } from "@/modules/compile";
import { Plugin } from "esbuild";
import fs from 'fs/promises';
import path from "path";

const exportApiTemplate = `\
export function %%FUNCTION%%(options) {
  return fetch('%%PATH%%', options);
}
export const %%FUNCTION_URL%% = '%%PATH%%';
`;

const moduleTemplate = `\
export function %%FUNCTION%%(options?: RequestInit): Promise<Response>;
export const %%FUNCTION_URL%%: '%%PATH%%';`;

/**
 * Generates functions to easily use lambda functions
 */
export const GenereateApiPlugin = (squidOptions: SquidOptions, type: 'lambda' | 'api') => ({
  name: 'GenereateApiPlugin',
  setup(pluginBuild) {

    pluginBuild.onStart(async () => {
      const exportStatements: string[] = [];
      const moduleStatements: string[] = [];

      const entryPoints = (pluginBuild.initialOptions.entryPoints as string[])
        .filter(path => !/\.props\.ts$/.test(path));

      for (const entryPoint of entryPoints) {
        const functionPath = entryPoint
          .replaceAll('\\', '/')
          .replace(`src/${type == 'lambda' ? 'lambda' : 'pages'}/`, '')
          .replace(/\.ts$/, '');

        const functionName = functionPath
          .replaceAll(/[^A-Za-z0-9\/]/g, '')
          .replace(/\/./g, x => x[1].toUpperCase());

        const functionEndpoint = type == 'lambda' ?
          squidOptions.packageName + '-' + functionPath.replace(/\//g, '-') :
          functionPath;

        const path = type == 'lambda' ?
          `${squidOptions.lambdaGateway}/function/${functionEndpoint}` :
          `/${functionPath}`;

        const exportStatement = exportApiTemplate
          .replaceAll('%%FUNCTION%%', functionName)
          .replaceAll('%%FUNCTION_URL%%', `${functionName}Url`)
          .replaceAll('%%PATH%%', type == 'lambda' ?
            path.replace(/^(http(s)?:\/\/)?/, 'http$2://') : path);

        const moduleStatement = moduleTemplate
          .replaceAll('%%FUNCTION_URL%%', `${functionName}Url`)
          .replaceAll('%%FUNCTION%%', functionName)
          .replaceAll('%%PATH%%', type == 'lambda' ?
            path.replace(/^(http(s)?:\/\/)?/, 'http$2://') : path);

        exportStatements.push(exportStatement);
        moduleStatements.push(moduleStatement);
      }

      await fs.writeFile(`./build/${type}.js`, exportStatements.join('\n'));
      await fs.writeFile(`./build/${type}.module.d.ts`,
        `declare module 'squid-ssr/${type}' {\n${moduleStatements.join('\n')}\n}`);
    });

  }
} as Plugin);

export const ConsumeApiPlugin = ({
  name: 'ConsumeApiPlugin',
  setup(pluginBuild) {

    pluginBuild.onResolve({ filter: /squid-ssr\/lambda/ }, async () => {
      return {
        path: path.resolve('./build/lambda.js')
      };
    });

    pluginBuild.onResolve({ filter: /squid-ssr\/api/ }, async () => {
      return {
        path: path.resolve('./build/api.js')
      };
    });
  }
} as Plugin);