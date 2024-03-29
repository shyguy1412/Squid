import { context as esbuildContext, build, Plugin, Metafile, BuildFailure, PartialMessage, transform, BuildOptions } from "esbuild";
import { glob } from "glob";
import { existsSync as fileExists } from 'fs';
import path from 'path';
import fs from "fs/promises";
import { ExportRenderPlugin } from "@/lib/plugins/RenderPlugin";
import { ErrorReporterPlugin } from "@/lib/plugins/ErrorReporterPlugin";
import { GenereateApiPlugin, ConsumeApiPlugin } from "@/lib/plugins/SquidApiPlugin";

type Tree = { [key: string]: Tree | string; };

export type SquidOptions = {
  packageName: string;
  lambdaGateway?: string;
  [key: string]: any;
};

async function getSubfoldersRecusive(p: string): Promise<string[]> {
  const contents = await fs.readdir(p, { recursive: true, withFileTypes: true });
  return [
    p,
    ...contents
      .filter(f => f.isDirectory())
      .map(f => './' + path.join(f.path ?? '', f.name).replaceAll('\\', '/'))
  ];
}

//https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
//Answer by: l2aelba (https://stackoverflow.com/users/622813)
function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Generates a tree of paths with the names of the corresponding modules at the end
 * this is used to map the path of an incoming request to the correct module
 * 
 * @param pathList A list of paths and a name for the node at the end of them
 * @returns A tree that the folder structure of the paths
 */
function generateTree(pathList: [string, string[]][]): Tree {
  function recursiveGeneration(tree: Tree, path: string[], name: string): Tree {
    const node = path.shift();

    if (!node) {
      return tree;
    }

    if (path.length == 0) {
      tree[node] = name;
      return tree;
    }

    if (!tree[node]) {
      tree[node] = {};
    }

    return recursiveGeneration((tree[node] as typeof tree), path, name);
  }

  const tree: Tree = {};
  pathList.forEach(([n, p]) => recursiveGeneration(tree, [...p], n));
  return tree;
};


/**
 * This plugin builds all the pages
 * and then generates and object representing the folder structure
 * to access them for server side rendering
 */
const SquidPlugin = (squidOptions: SquidOptions) => ({
  name: 'SquidPlugin',
  setup(pluginBuild) {

    //TIMING AND DATA COLLECTION
    let startTime: number;
    let metafiles:
      {
        api: Metafile | null;
        pages: Metafile | null;
        lambda: Metafile | null;
      } = {
      api: null, pages: null,
      lambda: null
    };

    pluginBuild.onStart(async () => {
      startTime = Date.now();
      if (fileExists('./build')) {
        await fs.rm('./build', { recursive: true });
      }
      await fs.mkdir('./build');
    });

    //Listener for success message and build information
    pluginBuild.onEnd(result => {
      if (result.errors.length > 0) return;

      const formatOutputFiles = (output: Metafile['outputs']): string[] => {
        const files = Object.keys(output);
        return files.map(file => `  \x1b[33m•\x1b[0m ${file} \x1b[32m${formatBytes(output[file].bytes)}\x1b[0m`);
      };

      console.log();
      console.log(formatOutputFiles(metafiles.pages!.outputs).join('\n'));
      console.log(formatOutputFiles(metafiles.api!.outputs).join('\n'));
      console.log(formatOutputFiles(metafiles.lambda!.outputs).join('\n'));
      console.log(formatOutputFiles(result.metafile!.outputs).join('\n'));
      console.log();
      console.log(`Frontend:   \x1b[32m${formatBytes([
        ...Object.values(metafiles.pages!.outputs).map(v => v.bytes),
      ].reduce((prev, cur) => prev + cur))}\x1b[0m`);
      console.log(`Backend:    \x1b[32m${formatBytes([
        ...Object.values(metafiles.api!.outputs).map(v => v.bytes),
        ...Object.values(result.metafile!.outputs).map(v => v.bytes),
      ].reduce((prev, cur) => prev + cur))}\x1b[0m`);
      console.log(`Lambda:    \x1b[32m${formatBytes([
        ...Object.values(metafiles.lambda!.outputs).map(v => v.bytes),
      ].reduce((prev, cur) => prev + cur))}\x1b[0m`);
      console.log(`Total size: \x1b[32m${formatBytes([
        ...Object.values(metafiles.pages!.outputs).map(v => v.bytes),
        ...Object.values(metafiles.api!.outputs).map(v => v.bytes),
        ...Object.values(result.metafile!.outputs).map(v => v.bytes),
      ].reduce((prev, cur) => prev + cur))}\x1b[0m`);
      console.log(`⚡ \x1b[32mDone in \x1b[33m${Date.now() - startTime}ms\x1b[0m`);
      console.log();
    });

    pluginBuild.onLoad({ filter: /pages/, namespace: 'squid' }, async (options) => {
      //this maps the output locations of all pages to a tuple containing the correct import path
      //and a suitable unique name for the default import based on the path
      // example: /home/user/project/build/pages/welcome/index.js ->
      // ["welcome_index", "./welcome/index.js"]
      const imports: [string, string][] = options.pluginData.pages
        .map((file: string) => file.replace(/^build\//, ''))
        .map((file: string) => (
          [
            file
              .replaceAll('\\', '/') //convert windows to unix
              .replaceAll(/(\/?)[{[(](.*?)[)}\]](\/?)/g, '$1$2$3') //remove parameter brackets
              .replaceAll(/[^A-Za-z0-9]/g, '_')  //make path to snake case name
              .replace(/_?m?js$/, ''), //remove file extension
            file]));

      const importPathFragments: [string, string[]][] = imports.map(([name, path]) => [name, path.replace(/^pages\//, '').replace(/\.[m]js$/, '').split('/')]);

      const tree: Tree = generateTree(importPathFragments);

      return {
        /**
         * Generate the import statements for all loaded pages
         * and export a map to find them by path
         */
        contents: [
          ...imports.map(([name, path]) => `import * as ${name} from './${path}';`),
          `export default ${imports.reduce(
            (prev, [name]) => prev.replace(`"${name}"`, name), JSON.stringify(tree, null, 2))
          };`
        ].join('\n'),
        resolveDir: './build',
      };
    });

    pluginBuild.onResolve({ filter: /^\.\/pages/ }, async (options) => {
      return { external: true }; // all pages are external
    });

    pluginBuild.onResolve({ filter: /squid-ssr\/pages/ }, async (options) => {
      const pagesEntryPoints = await glob('./src/pages/**/*.tsx');
      const apiEntryPoints = await glob('./src/pages/**/*.ts');
      const lambdaEntrypoints = await glob('./src/lambda/**/*.ts');

      const watchDirs = await getSubfoldersRecusive('./src');
      const additonalPlugins = pluginBuild.initialOptions.plugins?.filter(p => p.name != 'SquidPlugin') ?? [];

      /// SHARED PLUGINS ///
      additonalPlugins.unshift(ConsumeApiPlugin);

      try {
        const { metafile: lambdaMetafile } = await build({
          ...pluginBuild.initialOptions,
          entryPoints: lambdaEntrypoints,
          plugins: [
            GenereateApiPlugin(squidOptions, 'lambda'),
            ...additonalPlugins
          ],
          outExtension: { '.js': '.mjs' },
          bundle: true,
          splitting: false,
          packages: 'external',
          outbase: './src/lambda',
          outdir: './build/lambda/src',
          outfile: undefined,
          format: 'esm',
          platform: 'node',
          logLevel: 'silent',
          metafile: true,
        });

        metafiles['lambda'] = lambdaMetafile;

        const { metafile: apiMetafile } = await build({
          ...pluginBuild.initialOptions,
          entryPoints: apiEntryPoints,
          plugins: [
            GenereateApiPlugin(squidOptions, 'api'),
            ...additonalPlugins
          ],
          outExtension: { '.js': '.mjs' },
          bundle: true,
          splitting: true,
          packages: 'external',
          outbase: './src/pages',
          outdir: './build/pages',
          outfile: undefined,
          format: 'esm',
          platform: 'node',
          logLevel: 'silent',
          metafile: true,
        });
        metafiles['api'] = apiMetafile;

        const { metafile: pagesMetafile } = await build({
          ...pluginBuild.initialOptions,
          entryPoints: pagesEntryPoints,
          plugins: [
            ExportRenderPlugin,
            ...additonalPlugins
          ],
          outbase: './src/pages',
          outdir: './build/pages/',
          outfile: undefined,
          packages: undefined,
          outExtension: { '.js': '.mjs' },
          bundle: true,
          splitting: true,
          format: 'esm',
          platform: 'browser',
          jsxFactory: 'h',
          jsxFragment: 'Fragment',
          logLevel: 'silent',
          metafile: true,
          alias: { 'react': 'preact/compat' },
        });
        metafiles['pages'] = pagesMetafile;

        const combinedOutputs = [
          ...Object.keys(pagesMetafile.outputs),
          ...Object.keys(apiMetafile.outputs),
          ...Object.keys(lambdaMetafile.outputs)
        ];

        const pages = combinedOutputs
          .filter(path => /\.m?js$/.test(path))
          .filter(path => !/.*\/chunk-[A-Z0-9]{8}.m?js$/.test(path));

        const watchFiles = [
          ...Object.keys(pagesMetafile.inputs),
          ...Object.keys(apiMetafile.inputs),
          ...Object.keys(lambdaMetafile.inputs)
        ];

        return {
          path: 'pages',
          namespace: 'squid',
          pluginData: { pages },
          watchFiles,
          watchDirs
        };
      } catch (_) {
        const e = _ as BuildFailure;

        return {
          errors: e.errors,
          warnings: e.warnings,
          watchDirs,
          watchFiles: [
            ...pagesEntryPoints,
            ...apiEntryPoints,
            ...lambdaEntrypoints,
            ...e.errors.map(e => e.location?.file ?? '')
          ]
        };
      }
    });

    //after build copy public folder
    pluginBuild.onEnd(async (opts) => {
      if (!fileExists('./src/public')) {
        try {
          await fs.mkdir('./build/public');
        } catch (_) { }
      }
      else {
        await fs.cp('./src/public', './build/public', { recursive: true });
      }
      await fs.cp('./node_modules/squid-ssr/src/modules/hydrate.js', './build/public/hydrate.js');
    });
  }
} as Plugin);

export async function context(options: BuildOptions) {

  const package_json = JSON.parse((await fs.readFile('./package.json')).toString());

  const SquidOptions: SquidOptions = {
    lambdaGateway: undefined,
    packageName: package_json['name']
  };

  for (const option in SquidOptions) {
    SquidOptions[option] = (options as Record<string, any>)[option] ?? SquidOptions[option];
    delete (options as Record<string, any>)[option];
  }

  options.chunkNames = '__chunks/[name]-[hash]';

  return esbuildContext({
    tsconfig: 'tsconfig.json',
    ...options,
    plugins: [SquidPlugin(SquidOptions), ErrorReporterPlugin, ...options.plugins ?? []],
    entryPoints: ['./src/main.ts'],
    outfile: './build/main.mjs',
    bundle: true,
    splitting: false,
    packages: 'external',
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    metafile: true
  });
}