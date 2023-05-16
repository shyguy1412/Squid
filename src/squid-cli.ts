#!/usr/bin/env node

import { program } from "commander";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import nodemon from "nodemon";
import { getComponentContext, getSquidContext } from "./modules/compile";
import { server } from "./modules/server";

import type * as Types from "./types";
export {Types};

async function getContext() {
  if (existsSync('./build'))
    await rm('./build', { recursive: true });

  const componentContext = await getComponentContext();
  const squidContext = await getSquidContext();

  const rebuild = async () => {
    await componentContext.rebuild();
    await squidContext.rebuild();
  };

  const watch = async () => {
    componentContext.watch();
    squidContext.watch();
  };

  const dispose = async () => {
    componentContext.dispose();
    squidContext.dispose();
  };

  return {
    rebuild,
    watch,
    dispose
  }
}

program
  .command('build')
  .description('Build Project for production')
  .action(async () => {
    const { rebuild, dispose } = await getContext();

    await rebuild();
    await dispose();

  });

program
  .command('dev')
  .description('Starts Squid server and rebuilds development build of the Project on file changes')
  .action(async () => {

    const { rebuild, watch } = await getContext();
    
    await rebuild();
    await watch();

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
    server.start();
  });

program.parse();