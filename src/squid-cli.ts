#!/usr/bin/env node

import { spawn } from "child_process";
import { program } from "commander";
import nodemon from "nodemon";
import path from "path";
import fs from "fs/promises";
import { getContext } from "./modules/compile";

try {
  const package_json = JSON.parse((await fs.readFile('./package.json')).toString());
  if (package_json['name'])
    console.log(`Running in "${package_json['name']}"`);
} catch (e) {
  if (typeof e === 'object' && 'message' in e!) {
    console.error(e['message']);
  }
  console.log('Make sure to run squid in your project root!');
  process.exit(1);
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