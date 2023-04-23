#!/usr/bin/env node

import { program } from "commander";
import nodemon from "nodemon";
import { getESBuildContext, getSquidContext } from "./modules/compile";

async function build() {
  const esbuildContext = await getESBuildContext();
  const squidContext = await getSquidContext();

  await esbuildContext.rebuild();
  await squidContext.rebuild();

  return {
    esbuildContext,
    squidContext
  }
}

program
  .command('build')
  .description('Build Project for production')
  .action(async () => {
    const { esbuildContext, squidContext } = await build();

    esbuildContext.dispose();
    squidContext.dispose();

  });

program
  .command('dev')
  .description('Starts Squid server and rebuilds development build of the Project on file changes')
  .action(async () => {

    const { esbuildContext, squidContext } = await build();

    esbuildContext.watch();
    squidContext.watch();

    nodemon({
      scriptPosition: 0,
      script: 'build/squid-server.mjs',
      args: []
    });
  });

program
  .command('start')
  .description('Starts the Squid server')
  .action(() => {
  });

program.parse();