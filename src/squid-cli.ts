#!/usr/bin/env node

import { spawn } from "child_process";
import { program } from "commander";
import nodemon from "nodemon";
import path from "path";
import { getContext } from "./modules/compile";

// async function getContext() {
//   if (existsSync('./build'))
//     try { await rm('./build', { recursive: true }); } catch (_) { };

//   const context = await getBuildContext();


//   const rebuild = () => Promise.allSettled(context.map(context => context.rebuild()));
//   const watch = () => Promise.allSettled(context.map(context => context.watch()));
//   const dispose = () => Promise.allSettled(context.map(context => context.dispose()));

//   return {
//     rebuild,
//     watch,
//     dispose
//   };
// }

program
  .command('build')
  .description('Build project for production')
  .action(async () => {
    const { rebuild, dispose } = await getContext();

    await rebuild();
    await dispose();

  });

program
  .command('dev')
  .description('Starts Squid server and rebuilds development build of the project on file changes')
  .action(async () => {

    const { rebuild, watch } = await getContext();

    await rebuild();
    await watch();

    nodemon({
      scriptPosition: 0,
      script: 'build/main.mjs',
      args: []
    });
  });

program
  .command('start')
  .description('Starts the Squid server')
  .action(() => {
    spawn('node', [path.resolve(process.cwd(), 'build/main.mjs')], {
      cwd: process.cwd(),
      stdio: "inherit"
    });
  });

program.parse();