#!/usr/bin/env node

import { spawn } from "child_process";
import { program } from "commander";
import { createSocket } from "dgram";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import nodemon from "nodemon";
import path from "path";
import { getComponentContext, getSquidContext } from "./modules/compile";
// import { server } from "./modules/server";

import type * as Types from "./types";
export { Types };

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
  };
}

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
      script: 'build/squid-server.mjs',
      args: []
    });
  });

program
  .command('start')
  .description('Starts the Squid server')
  .action(() => {
    const ipcSocket = createSocket('udp4');
    const port = Number.parseInt(process.env.SQUID_PORT ?? '0') || 3000;
    //Process must NOT inherit stdio. This causes the gitlab CI/CD pipeline to get stuck (because why not?)
    //even after the CLI process terminates (prolly cause it waits for stdio to be free again?)
    const serverProcess = spawn('node', [path.resolve(process.cwd(), 'build/squid-server.mjs')], {
      cwd: process.cwd(),
      detached: true
    });

    serverProcess.on('exit', () => process.exit());

    ipcSocket.on("message", (msg) => {
      if (msg.toString('utf-8') == 'started')
        process.exit();
    });

    ipcSocket.bind(port - 1, 'localhost');

    //We still gotta get the console output tho
    serverProcess.stdout.on('data', data => process.stdout.write(data));
    serverProcess.stderr.on('data', data => process.stderr.write(data));
    serverProcess.unref();
  });

program
  .command('stop')
  .description('Stops the Squid server')
  .action(() => {
    const ipcSocket = createSocket('udp4');
    const port = Number.parseInt(process.env.EXPRESS_PORT ?? '0') || 3000;
    ipcSocket.send('exit', port + 1, 'localhost', (err) => {
      console.log(err ?? 'Stopped');
      process.exit();
    });
  });

program.parse();