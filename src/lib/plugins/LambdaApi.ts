import { SquidOptions } from "@/modules/compile";
import { Plugin } from "esbuild";
import fs from 'fs/promises';
import path from "path";

const exportLambdaTemplate = `\
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
export const GenereateLambdaApi = (squidOptions: SquidOptions) => ({
  name: 'GenereateLambdaApi',
  setup(pluginBuild) {

    pluginBuild.onStart(async () => {
      const exportStatements: string[] = [];
      const moduleStatements: string[] = [];
      for (const entryPoint of pluginBuild.initialOptions.entryPoints as string[]) {
        const functionPath = entryPoint
          .replaceAll('\\', '/')
          .replace('src/lambda/', '')
          .replace(/\.ts$/, '');

        const functionName = functionPath.replace(/\/./g, x => x[1].toUpperCase());
        const functionEndpoint = squidOptions.packageName + '-' + functionPath.replace(/\//g, '-');
        const lambdaPath = `${squidOptions.lambdaGateway}/function/${functionEndpoint}`;

        const exportStatement = exportLambdaTemplate
          .replaceAll('%%FUNCTION%%', functionName)
          .replaceAll('%%FUNCTION_URL%%', `${functionName}Url`)
          .replaceAll('%%PATH%%', lambdaPath.replace(/^(http(s)?:\/\/)?/, 'http$2://'));

        const moduleStatement = moduleTemplate
          .replaceAll('%%FUNCTION_URL%%', `${functionName}Url`)
          .replaceAll('%%FUNCTION%%', functionName)
          .replaceAll('%%PATH%%', lambdaPath.replace(/^(http(s)?:\/\/)?/, 'http$2://'));

        exportStatements.push(exportStatement);
        moduleStatements.push(moduleStatement);
      }

      await fs.writeFile('./build/lambda.js', exportStatements.join('\n'));
      await fs.writeFile('./build/lambda.module.d.ts', `declare module 'squid-ssr/lambda' {\n${moduleStatements.join('\n')}\n}`);
    });

  }
} as Plugin);

export const LambdaApiPlugin = ({
  name: 'LambdaApiPlugin',
  setup(pluginBuild) {

    pluginBuild.onResolve({ filter: /squid-ssr\/lambda/ }, async () => {
      // console.log(path.resolve('./build/lambda.ts'));
      return {
        path: path.resolve('./build/lambda.js')
      };
    });
  }
} as Plugin);