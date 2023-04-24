import { context } from "esbuild";
import fs, { existsSync, fstatSync, FSWatcher, lstatSync } from "fs";
import { copyFile } from "fs/promises";
import { glob } from "glob";
import path from "path";

export async function getComponentContext() {
  async function esContext() {
    return context({
      entryPoints: (await glob('./src/pages/**/*.tsx')),
      // minify: true,
      bundle: true,
      outdir: 'build/pages',
      format: 'esm',
      platform: 'browser',
      external: ['preact/hooks'],
      logLevel: 'info',
      tsconfig: 'tsconfig.export.json',
      outExtension: { '.js': '.mjs' }
    });
  }


  let componentContext = await esContext();
  let fsWatcher: FSWatcher;

  const rebuild = () => {
    return componentContext.rebuild();
  };

  const watch = () => {
    fsWatcher = fsWatcher ?? fs.watch('./src/pages', { recursive: true });
    fsWatcher.addListener('change', async (ev, file) => {
      componentContext = await esContext();
      rebuild()
    });
  };

  const dispose = () => {
    if (fsWatcher) fsWatcher.close();
    componentContext.dispose();
  };

  return {
    rebuild,
    watch,
    dispose
  }
}

function FileBuilder(file: string, dest: string) {
  let fsWatcher: fs.FSWatcher;


  const rebuild = async () => {
    await copyFile(file, path.resolve(process.cwd(), dest));
  }

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
  }
}

export async function getSquidContext() {
  const serverScriptPath = './node_modules/squid/dist/squid-server.mjs';
  const clientScriptPath = './node_modules/squid/dist/squid-client.js';

  const builder = [
    FileBuilder(serverScriptPath, './build/squid-server.mjs'),
    FileBuilder(clientScriptPath, './build/squid-client.js')
  ]

  const rebuild = () => Promise.allSettled(builder.map(builder => builder.rebuild()));
  const watch = () => builder.forEach(builder => builder.watch());
  const dispose = () => builder.forEach(builder => builder.dispose());

  return {
    rebuild,
    watch,
    dispose
  };
}