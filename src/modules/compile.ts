import { context, build, Plugin, Metafile, BuildFailure, PartialMessage } from "esbuild";
import { glob } from "glob";
import { existsSync as fileExists } from 'fs';
import path from 'path';
import fs from "fs/promises";

type Tree = { [key: string]: Tree | string; };

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

async function getSubfoldersRecusive(p: string): Promise<string[]> {
  const contents = await fs.readdir(p, { recursive: true, withFileTypes: true });
  return [
    p,
    ...contents
      .filter(f => f.isDirectory())
      .map(f => './' + path.join(f.path, f.name).replaceAll('\\', '/'))];
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
    //TIMING AND DATA COLLECTION
    let startTime: number;
    let metafiles: { api: Metafile | null, pages: Metafile | null; } = { api: null, pages: null };
    pluginBuild.onStart(() => {
      startTime = Date.now();
    });

    //Listener for error message and information
    pluginBuild.onEnd(result => {
      if (result.errors.length == 0) return;

      const highlightText = (text: string, start: number, end: number) => {
        const before = text.substring(0, start);
        const toHighlight = text.substring(start, end);
        const highlighted = `\x1b[92m${toHighlight}\x1b[0m`;
        const after = text.substring(end);
        return before + highlighted + after + `\n` +
          //squiggles
          before.replaceAll(/./g, ' ') +
          `\x1b[92m${toHighlight.replaceAll(/./g, '~')}\x1b[0m`
          ;
      };

      const formatMessage = (m: PartialMessage, error = true) => {
        const message =
          `${error ? '❌' : '⚠️'} \x1b[41m\x1b[97m[ERROR]\x1b[0m ` +
          `${m.text}\n\n` +
          `    ${m.location?.file ?? 'source'}:${m.location?.line ?? 'unknown'}:${m.location?.column ?? 'unknown'}:\n` +
          `      ${m.location?.lineText ?
            highlightText(
              m.location.lineText,
              m.location.column ?? 0,
              (m.location.column ?? 0) + (m.location.length ?? 0)).replace('\n', '\n      ')
            : ''}`;

        return message;
      };

      result.errors.forEach(e => console.log(formatMessage(e)));
      result.warnings.forEach(e => console.log(formatMessage(e)));

      console.log(`${result.errors.length} ${result.errors.length == 1 ? 'error' : 'errors'}`);


      // console.log(result.errors[0]);

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
      console.log(formatOutputFiles(result.metafile!.outputs).join('\n'));
      console.log();
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
      try {
        const pagesEntryPoints = await glob('./src/pages/**/*.tsx');
        const { metafile: pagesMetafile } = await build({
          bundle: true,
          entryPoints: pagesEntryPoints,
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
          logLevel: 'silent',
          metafile: true
        });

        metafiles['pages'] = pagesMetafile;

        const apiEntryPoints = await glob('./src/pages/**/*.ts');
        const { metafile: apiMetafile } = await build({
          entryPoints: apiEntryPoints,
          outExtension: { '.js': '.mjs' },
          outbase: './src/pages',
          outdir: './build/pages',
          format: 'esm',
          platform: 'node',
          tsconfig: 'tsconfig.json',
          logLevel: 'silent',
          metafile: true
        });

        console.log('AAAAA');


        metafiles['api'] = apiMetafile;

        const combinedOutputs = [...Object.keys(pagesMetafile.outputs), ...Object.keys(apiMetafile.outputs)];
        const pages = combinedOutputs
          .filter(path => /\.m?js$/.test(path))
          .filter(path => !/.*\/chunk-[A-Z0-9]{8}.m?js$/.test(path));

        const watchDirs = await getSubfoldersRecusive('./src');
        const watchFiles = [...Object.keys(apiMetafile.inputs), ...Object.keys(pagesMetafile.inputs)];

        return {
          path: 'pages',
          namespace: 'squid',
          pluginData: { pages },
          watchFiles,
          logLevel: 'silent',
          watchDirs
        };
      } catch (_) {
        const e = _ as BuildFailure;

        return {
          errors: [...e.errors],
          warnings: [...e.warnings],
        };
      }
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
    logLevel: 'silent',
    metafile: true
  });
}