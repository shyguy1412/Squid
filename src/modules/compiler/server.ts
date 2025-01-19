import { context, Plugin, PluginBuild } from "esbuild";
import { CompileOptions } from "@/modules/compiler";
import path from 'path';
import fs from "fs/promises";
import { ErrorReporterPlugin } from "@/lib/plugins/ErrorReporterPlugin";

async function getSubfoldersRecusive(p: string): Promise<string[]> {
  const contents = await fs.readdir(p, { recursive: true, withFileTypes: true });
  return [
    p,
    ...contents
      .filter(f => f.isDirectory())
      .map(f => './' + path.join(f.parentPath ?? '', f.name).replaceAll('\\', '/'))
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
type Tree = { [key: string]: Tree | string; };
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

const ServerPlugin = (options: CompileOptions): Plugin => ({
  name: "ServerPlugin",
  setup: function (build: PluginBuild): (void | Promise<void>) {
    //TIMING AND DATA COLLECTION
    let startTime: number;

    build.onResolve({ filter: /^squid-ssr\/pages$/ }, async (options) => {
      return {
        path: 'pages',
        namespace: 'squid',
        external: false
      };
    });

    build.onResolve({ filter: /^squid-ssr\/middleware$/ }, async (options) => {
      return {
        path: path.resolve("./node_modules/squid-ssr/dist/middleware.js"),
        external: false
      };
    });

    build.onLoad({ filter: /pages/, namespace: 'squid' }, async (options) => {
      const pages = await fs.readdir("./src/pages", { recursive: true, withFileTypes: true })
        .then(entries => entries.filter(e => e.isFile()))
        .then(files => files.map(f => `${f.parentPath}/${f.name}`.replace(/\.?\/?src\/pages\//, "")));

      //this maps the output locations of all pages to a tuple containing the correct import path
      //and a suitable unique name for the default import based on the path
      // example: /home/user/project/build/pages/welcome/index.js ->
      // ["welcome_index", "./welcome/index.js"]
      const imports: [string, string][] = pages
        .map((file: string) => file.replace(/^build\//, ''))
        .map((file: string) => (
          [
            file
              .replaceAll('\\', '/') //convert windows to unix
              .replaceAll(/(\/?)[{[(](.*?)[)}\]](\/?)/g, '$1$2$3') //remove parameter brackets
              .replaceAll(/[^A-Za-z0-9]/g, '_'),  //make path to snake case name
            file
          ]));



      const importPathFragments: [string, string[]][] = imports.map(([name, path]) => [name, path.replace(/^pages\//, '').replace(/\.tsx?/, '').split('/')]);

      const tree: Tree = generateTree(importPathFragments);

      const contents = [
        ...imports.map(([name, path]) => `import * as ${name} from './${path}';`),
        `export default ${imports.reduce(
          (prev, [name]) => prev.replace(`: "${name}"`, `: {...${name}, api: ${name.endsWith("_ts")}}`), JSON.stringify(tree, null, 2))
        };`
      ].join('\n');

      return {
        /**
         * Generate the import statements for all loaded pages
         * and export a map to find them by path
         */
        contents,
        resolveDir: "./src/pages/",
        loader: "tsx"
      };
    });

  }
});

export function getServerContext(options: CompileOptions) {
  return context({
    ...options,
    tsconfig: 'tsconfig.json',
    plugins: [
      ServerPlugin(options),
      ErrorReporterPlugin,
    ],
    entryPoints: ['./src/main.ts'],
    outfile: './build/main.mjs',
    packages: "external",
    bundle: true,
    splitting: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    metafile: true
  });
}