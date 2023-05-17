import { build, BuildResult } from "esbuild";
import fs, { FSWatcher } from "fs";
import { copyFile, readFile } from "fs/promises";
import { glob } from "glob";
import path from "path";


export async function getComponentContext() {
  async function buildPages() {
    const componentSSRInjection =
      '\nexport {h, hydrate} from \'preact\'\n'
      + 'export {render} from \'preact-render-to-string\'\n';

    const promises: Promise<BuildResult>[] = [];
    const start = Date.now();
    const files = await glob('./src/pages/**/*.{ts,tsx}');
    for (const file of files) {
      const isComponent = file.includes('.tsx');
      const fileName = path.basename(file.replace(/\.ts[x]?/, '.mjs'));
      const destinationPath = file.replace(path.basename(file), '').replace('src', 'build');

      promises.push(build({
        bundle: true,
        outfile: path.join(destinationPath, fileName),
        format: 'esm',
        platform: 'browser',
        tsconfig: 'tsconfig.export.json',
        jsxFactory: 'h',
        jsxFragment: 'Fragment',
        stdin: {
          loader: 'tsx',
          resolveDir: path.resolve('.'),
          contents: (await readFile(file)).toString('utf8')
            + (isComponent ? componentSSRInjection : ''),
        }
      }));
      console.log(`\t- ${path.join(destinationPath, fileName)}`);
    }
    await Promise.all(promises);
    console.log(`\x1b[32m• \x1b[0mBuilt pages in \x1b[33m${Date.now() - start}ms\x1b[0m`);

  }

  let fsWatcher: FSWatcher;

  const rebuild = async () => {
    await buildPages();
  };

  //TODO: Maybe only compile the changed and related files?
  //To much of a pain to implement rn tho since full compile times are usually under 500ms ¯\_(ツ)_/¯
  const watch = () => {
    console.log('WATCH CALLED');
    let timeout: NodeJS.Timeout | undefined;
    fsWatcher = fsWatcher ?? fs.watch('./src/pages', { recursive: true });
    fsWatcher.addListener('change', async (ev, file) => {
      if(timeout)return;
      timeout = setTimeout(async () => {
        await buildPages();
        timeout = undefined;
      },10)
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

  return {
    rebuild,
    watch,
    dispose
  };
}