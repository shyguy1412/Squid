import { context, build, Plugin } from "esbuild";
import { glob } from "glob";
import { existsSync as fileExists } from 'fs';
import fs from "fs/promises";

type Tree = { [key: string]: Tree | string; };

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
 * Exports the functions necissary for server side rendering and hydration from a page
 */
const ExportRenderPlugin: Plugin = {
  name: 'ExportRenderPlugin',
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /pages/ }, async (opts) => {
      const contents = (await fs.readFile(opts.path))
        + '\nexport {h, hydrate} from \'preact\';'
        + '\nexport {render} from \'preact-render-to-string\';';
      return {
        contents,
        loader: 'tsx'
      };
    });
  }
};

/**
 * This plugin builds all the pages
 * and then generates and object representing the folder structure
 * to access them for server side rendering
 */
const SquidPlugin: Plugin = {
  name: 'SquidPlugin',
  setup(pluginBuild) {
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
              .replaceAll('/', '_')  //make path to snake case name
              .replace(/\.m?js$/, ''), //remove file extension
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


    pluginBuild.onResolve({ filter: /squid\/pages/ }, async (options) => {
      const { metafile: { outputs: pageOutputs } } = await build({
        bundle: true,
        entryPoints: await glob('./src/pages/**/*.tsx'),
        plugins: [ExportRenderPlugin],
        outbase: './src/pages',
        outdir: './build/pages/',
        outExtension: { '.js': '.mjs' },
        format: 'esm',
        splitting: true,
        platform: 'browser',
        tsconfig: 'tsconfig.json',
        jsxFactory: 'h',
        jsxFragment: 'Fragment',
        metafile: true
      });

      const { metafile: { outputs: apiOutputs } } = await build({
        entryPoints: await glob('./src/pages/**/*.ts'),
        outExtension: { '.js': '.mjs' },
        outbase: './src/pages',
        outdir: './build/pages',
        format: 'esm',
        platform: 'node',
        tsconfig: 'tsconfig.json',
        metafile: true
      });

      const pages = [...Object.keys(pageOutputs), ...Object.keys(apiOutputs)]
        .filter(path => !/.*\/chunk-[A-Z0-9]{8}.m?js$/.test(path));

      return {
        path: 'pages',
        namespace: 'squid',
        pluginData: { pages },

      };
    });

    //after build copy public folder
    pluginBuild.onEnd(async () => {
      if (!fileExists('./public')) {
        try {
          await fs.mkdir('./build/public');
        } catch (_) { }
      }
      else {
        await fs.cp('./public', './build/public', { recursive: true });
      }
      await fs.cp('./node_modules/squid-ssr/src/modules/hydrate.js', './build/public/hydrate.js');
    });

    // ? Currently only express is external because it can not be bundled
    // ? Users might import stuff in the API that can not be bundled aswell
    // ? In the future, the hook below could mark all known troublemakers as external
    // pluginBuild.onResolve({ filter: /.*/ }, async (opts) => {
    //   const importPath = opts.resolveDir.replaceAll('\\', '/');
    //   console.log(importPath);

    //   return { external: false };
    // });
  }
};

export async function getContext() {
  if (fileExists('./build'))
    await fs.rm('./build', { recursive: true });

  const config = JSON.parse((await fs.readFile('./squid.json')).toString());

  return await context({
    bundle: true,
    entryPoints: ['./src/main.ts'],
    preserveSymlinks: true,
    plugins: [SquidPlugin],
    outfile: './build/main.mjs',
    format: 'esm',
    platform: 'node',
    tsconfig: 'tsconfig.json',
    external: ['express', ...config['buildOptions']?.['external'] ?? []],
    metafile: true
  });
}