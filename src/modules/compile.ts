import { context } from "esbuild";
import fs from "fs";
import { copyFile } from "fs/promises";
import { glob } from "glob";
import path from "path";

export async function getESBuildContext() {
  return context({
    entryPoints: (await glob('./src/**/*.tsx')),
    // minify: true,
    bundle: true,
    outdir: 'build',
    format: 'esm',
    platform: 'browser',
    external: ['preact'],
    logLevel: 'info',
    outExtension: { '.js': '.mjs' }
  });
}

function FileBuilder(file: string, dest: string) {
  let fsWatcher: fs.FSWatcher;

  const rebuild = () => copyFile(file, path.resolve(process.cwd(), dest))
  const watch = () => {
    fsWatcher = fsWatcher ?? fs.watch(file);
    fsWatcher.on('change', () => rebuild());
  }
  const dispose = () => !fsWatcher || fsWatcher.close();

  return {
    rebuild,
    watch,
    dispose
  }
}

export async function getSquidContext() {
  const serverScriptPath = 'node_modules/squid/dist/squid-server.mjs';
  const clientScriptPath = 'node_modules/squid/dist/squid-client.js';

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