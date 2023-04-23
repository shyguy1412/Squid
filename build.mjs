import { context } from 'esbuild';

const WATCH = process.argv.includes('--watch');

const mainContext = await context({
  entryPoints: ['./src/squid-cli.ts'],
  outfile: './dist/squid-cli.js',
  minify: !WATCH,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  define: WATCH ? undefined : {
    'process.env.NODE_ENV': "'production'",
  },
  external: ['esbuild', 'nodemon'],
  logLevel: 'info'
});

mainContext.rebuild();

if (WATCH) {
  mainContext.watch();
}

const serverContext = await context({
  entryPoints: ['./src/squid-server.ts'],
  outfile: './dist/squid-server.mjs',
  minify: !WATCH,
  // bundle: true,
  format: 'esm',
  platform: 'node',
  define: WATCH ? undefined : {
    'process.env.NODE_ENV': "'production'",
  },
  // external: ['preact'],
  logLevel: 'info'
});

serverContext.rebuild();

if (WATCH) {
  serverContext.watch();
}

const clientContext = await context({
  entryPoints: ['./src/squid-client.ts'],
  outfile: './dist/squid-client.js',
  minify: !WATCH,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  // external: ['preact'],
  logLevel: 'info'
});

clientContext.rebuild();

if (WATCH) {
  clientContext.watch();
}