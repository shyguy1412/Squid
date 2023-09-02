import { context } from 'esbuild';
import { rm } from 'fs/promises';

await rm('./dist', { recursive: true });

const WATCH = process.argv.includes('--watch');

const cliContext = await context({
  entryPoints: ['./src/squid-cli.ts'],
  bundle: true,
  external: ['./node_modules/*'],
  outfile: './dist/squid-cli.js',
  minify: !WATCH,
  format: 'esm',
  platform: 'node',
  define: WATCH ? undefined : {
    'process.env.NODE_ENV': "'production'",
  },
  logLevel: 'info'
});

await cliContext.rebuild();

if (WATCH) cliContext.watch();
else cliContext.dispose();