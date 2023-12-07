import { context } from 'esbuild';
import { rm } from 'fs/promises';
import { existsSync as fileExists } from 'fs';
import { exec } from 'child_process';

if (fileExists('./dist'))
  await rm('./dist', { recursive: true });

const WATCH = process.argv.includes('--watch');

const typePlugin = {
  name: "TypePlugin",
  setup(pluginBuild) {
    pluginBuild.onEnd(() => {
      exec('npx tsc');
    });
  }
};

const ctx = await context({
  entryPoints: ['./src/squid-cli.ts', './src/hooks/index.ts', './src/hooks/client/index.ts', './src/index.ts'],
  bundle: true,
  plugins: [typePlugin],
  packages: 'external',
  // outExtension: {'.js': '.mjs'},
  outdir: './dist',
  outbase: "./src",
  tsconfig: './tsconfig.json',
  minify: !WATCH,
  format: 'cjs',
  platform: 'node',
  define: WATCH ? undefined : {
    'process.env.NODE_ENV': "'production'",
  },
  logLevel: 'info'
});

await ctx.rebuild();

if (WATCH) ctx.watch();
else ctx.dispose();