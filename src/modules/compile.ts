import { build, BuildResult } from "esbuild";
import fs, { FSWatcher } from "fs";
import { copyFile, readFile } from "fs/promises";
import { glob } from "glob";
import path from "path";


export async function getComponentContext() {
  async function buildPages() {
    const promises: Promise<BuildResult>[] = [];

    const start = Date.now();

    const files = await glob('./src/pages/**/*.tsx');
    for (const file of files) {
      promises.push(build({
        bundle: true,
        outfile: file.replace('src', 'build').replace('.tsx', '.mjs'),
        format: 'esm',
        platform: 'browser',
        // logLevel: 'info',
        tsconfig: 'tsconfig.export.json',
        jsxFactory: 'h',
        jsxFragment: 'Fragment',
        // outExtension: { '.js': '.mjs' },
        stdin: {
          contents: (await readFile(file)).toString('utf8')
            + '\nexport {h, hydrate} from \'preact\'\n'
            + 'export {render} from \'preact-render-to-string\'\n',
          loader: 'tsx',
          resolveDir: path.resolve('.')
        }
      }));
    }
    await Promise.all(promises);
    console.log(`Compiled pages in ${Date.now() - start}ms`)

  }


  let fsWatcher: FSWatcher;

  const rebuild = async () => {
    await buildPages();
  };

  const watch = () => {
    fsWatcher = fsWatcher ?? fs.watch('./src/pages', { recursive: true });
    fsWatcher.addListener('change', async (ev, file) => {
      await buildPages();
    });
  };

  const dispose = () => {
    if (fsWatcher) fsWatcher.close();
  };

  return {
    rebuild,
    watch,
    dispose
  };
}

function FileBuilder(file: string, dest: string) {
  let fsWatcher: fs.FSWatcher;


  const rebuild = async () => {
    await copyFile(file, path.resolve(process.cwd(), dest));
  };

  const watch = () => {
    fsWatcher = fsWatcher ?? fs.watch(file);
    fsWatcher.on('change', () => rebuild());
  };

  const dispose = () => {
    if (fsWatcher) fsWatcher.close();
  };

  return {
    rebuild,
    watch,
    dispose
  };
}

export async function getSquidContext() {
  const serverScriptPath = './node_modules/squid/dist/squid-server.mjs';
  const clientScriptPath = './node_modules/squid/dist/hydrate.js';

  const builder = [
    FileBuilder(serverScriptPath, './build/squid-server.mjs'),
    FileBuilder(clientScriptPath, './build/hydrate.js')
  ];

  const rebuild = () => Promise.allSettled(builder.map(builder => builder.rebuild()));
  const watch = () => builder.forEach(builder => builder.watch());
  const dispose = () => builder.forEach(builder => builder.dispose());

  console.log('SQUIDDING');


  return {
    rebuild,
    watch,
    dispose
  };
}