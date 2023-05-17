import { context } from 'esbuild';

const WATCH = process.argv.includes('--watch');

const cliContext = await context({
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

await cliContext.rebuild();

if (WATCH)  cliContext.watch();
else cliContext.dispose();

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