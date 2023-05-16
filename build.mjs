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

await mainContext.rebuild();

if (WATCH)  mainContext.watch();
else mainContext.dispose();

const serverContext = await context({
  entryPoints: ['./src/squid-server.ts'],
  outfile: './dist/squid-server.mjs',
  minify: !WATCH,
  bundle: true,
  format: 'esm',
  platform: 'node',
  define: WATCH ? undefined : {
    'process.env.NODE_ENV': "'production'",
  },
  external: ['path', 'express'],
  logLevel: 'info'
});

await serverContext.rebuild();

if (WATCH)  serverContext.watch();
else serverContext.dispose();

const hydrate = await context({
  entryPoints: ['./src/modules/hydrate.ts'],
  outfile: './dist/hydrate.js',
  minify: !WATCH,
  // bundle: true,
  format: 'esm',
  platform: 'browser',
  // external: ['preact'],
  logLevel: 'info'
});

await hydrate.rebuild();

if (WATCH)  hydrate.watch();
else hydrate.dispose();