#!/usr/bin/env node

import { spawn } from "child_process";
import { program } from "commander";
import nodemon from "nodemon";
import path from "path";
import fs from "fs/promises";
import { existsSync as fileExists } from "fs";
import { getContext } from "./modules/compile";

import PageTemplate from '@/templates/Page.txt';
import ApiTemplate from '@/templates/ApiEndpoint.txt';
import ComponentTemplate from '@/templates/Component.txt';
import PropsTemplate from '@/templates/Props.txt';

(async () => {
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

      try {
        await rebuild();
      } catch (e) { }

      await dispose();
    });

  program
    .command('dev')
    .description('Starts Squid server and rebuilds development build of the project on file changes')
    .action(async () => {

      const { rebuild, watch } = await getContext();

      // await rebuild();
      await watch();

      //esbuild sadly doesnt have a way to wait for the first build
      //so polling it is
      while (!fileExists('./build/main.mjs')) {
        await new Promise<void>(resolve => setTimeout(() => resolve(), 100));
      }

      nodemon({
        scriptPosition: 0,
        script: './build/main.mjs',
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

  program
    .command('gen')
    .argument('<type>', 'What component to generate. (comp, page, api)')
    .argument('<path>', 'Where to generate the component')
    .description('Generate new components, pages or API endpoints.')
    .action(async (type, path) => {
      if (!path) throw new Error('No path was given');
      if (typeof path !== 'string') throw new Error('Invalid path: ' + path);
      switch (type) {
        case 'comp':
          try {
            const fullPath = './src/components/' + path;
            await createDirectory(fullPath);
            await fs.writeFile((fullPath).replace(/(.tsx)?$/, '.tsx'), ComponentTemplate.replace('%COMPONENT_NAME%', path.split('/').at(-1) ?? 'Component'), {});
          } catch (e) {
            console.log(e);
            throw new Error('Invalid path');
          }
          break;
        case 'page':
          try {
            const fullPath = './src/pages/' + path;
            await createDirectory(fullPath);
            await fs.writeFile((fullPath).replace(/(.tsx)?$/, '.tsx'), `import type {ServerSideProps} from '@/pages/${(path).replace(/(.tsx)?$/, '.props')}'\n${PageTemplate}`);
            await fs.writeFile((fullPath).replace(/(.tsx)?$/, '.props.ts'), PropsTemplate);
          } catch (e) {
            throw new Error('Invalid path');
          }
          break;
        case 'api':
          try {
            const fullPath = './src/pages/' + path;
            await createDirectory(fullPath);
            await fs.writeFile((fullPath).replace(/(.ts)?$/, '.ts'), ApiTemplate);
          } catch (e) {
            throw new Error('Invalid path');
          }
          break;
        default:
          throw new Error('Invalid type: ' + type);
      }
    })
    .options;

  program.parse();
})();

async function createDirectory(path: string) {
  try {
    await fs.mkdir(path.replace(/\/([^\/]+)\/?$/, ''), { recursive: true });
  } catch (e) {
  }
}