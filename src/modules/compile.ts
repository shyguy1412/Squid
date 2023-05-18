import { build, BuildResult, context } from "esbuild";
import fs, { FSWatcher } from "fs";
import { cp, readFile } from "fs/promises";
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
        platform: isComponent?'browser':'node',
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
    let timeout: NodeJS.Timeout | undefined;
    fsWatcher = fsWatcher ?? fs.watch('./src', { recursive: true });
    fsWatcher.addListener('change', async (ev, file) => {
      if (timeout) return;
      timeout = setTimeout(async () => {
        await buildPages();
        timeout = undefined;
      }, 10);
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
    try {
      await cp(path.resolve(file), path.resolve(process.cwd(), dest), { recursive: true });
    } catch (e) {
      console.log(e);
    }
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

type Builder = {
  rebuild: () => any,
  watch: () => any,
  dispose: () => any;
};

export async function getSquidContext() {
  const publicPath = './public/';
  const clientScriptPath = './node_modules/squid-ssr/dist/hydrate.js';

  const builders: Builder[] = [
    // FileBuilder(serverScriptPath, './build/squid-server.mjs'),
    await context({
      bundle: true,
      entryPoints: ['./src/main.ts'],
      outfile: path.join('./build', 'main.js'),
      format: 'cjs',
      platform: 'node',
      tsconfig: 'tsconfig.export.json',
      external: ['express']
    }),
    FileBuilder(clientScriptPath, './build/public/hydrate.js'),
    FileBuilder(publicPath, './build/public/'),
  ];

  const rebuild = async () => {
    for (const builder of builders) {
      await builder.rebuild();
    }
  };
  const watch = () => builders.forEach(builder => builder.watch());
  const dispose = () => builders.forEach(builder => builder.dispose());

  return {
    rebuild,
    watch,
    dispose
  };
}