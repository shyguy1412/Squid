#!/usr/bin/env node

import { spawn, SpawnOptions } from "child_process";
import { program } from "commander";
import nodemon from "nodemon";
import path from "path";
import fs from "fs/promises";
import { existsSync as fileExists } from "fs";
import { platform } from "os";

import PageTemplate from '@/templates/Page.txt';
import ApiTemplate from '@/templates/ApiEndpoint.txt';
import ComponentTemplate from '@/templates/Component.txt';
import PropsTemplate from '@/templates/Props.txt';

import LambdaDockerfile from '@/templates/lambda/Dockerfile.txt';
import LambdaDockerignore from '@/templates/lambda/.dockerignore.txt';
import LambdaEntrypoint from '@/templates/lambda/entrypoint.txt';
import LambdaFunctionTemplate from '@/templates/lambda/LambdaFunction.txt';

const npmExec = platform() == 'win32' ? 'npm.cmd' : 'npm';

(async () => {
  let packageName = '';
  try {
    const package_json = JSON.parse((await fs.readFile('./package.json')).toString());
    if (package_json['name'])
      console.log(`Running in "${package_json['name']}"`);
    packageName = package_json['name'];
  } catch (e) {
    if (typeof e === 'object' && 'message' in e!) {
      console.error(e['message']);
    }
    console.log('Make sure to run squid in your project root!');
    process.exit(1);
  }

  program
    .command('start')
    .description('Starts the Squid server')
    .action(() => {
      spawn('node', [path.resolve(process.cwd(), 'build/main.mjs')], {
        cwd: process.cwd(),
        stdio: "inherit"
      });
    });

  const lambda = program
    .command('lambda')
    .description('build, push and deploy squid lambda functions');

  lambda.command('build')
    .description('build the functions, config files and containers')
    .option('-p, --prefix <prefix>', 'prefix for the containers')
    .option('-r, --registry <registry>', 'Private Registry, if not given this will default to DockerHub')
    .option('-g, --gateway <gateway-url>', 'gateway where the functions will be deployed')
    .option('-D, --no-docker', 'only build the packages and config, skip building the containers')
    .action(async (opts) => {
      await exec(npmExec, ['run', 'build'], {
        cwd: process.cwd(),
        stdio: "inherit"
      });

      if (!fileExists('./build/lambda/src')) {
        console.log('Project does not contain any lambda function');
        return;
      }

      await fs.mkdir('./build/lambda/build');

      fs.writeFile('./build/lambda/build/config.json', JSON.stringify(opts));

      const lambdaDir = await fs.readdir('./build/lambda/src', { recursive: true, })
        .then(f => f.filter(f => f.endsWith('.mjs')))
        .then(f => f.map(f => [
          f, (packageName + '-' + f)
            .replaceAll('\\', '/')
            .replaceAll('/', '-')
            .replaceAll(/-?([A-Z])/g, (_, x: string) => '-' + x.toLowerCase())
            .split('.')[0]
        ]));

      for (const [file, functionName] of lambdaDir) {
        const buildDir = `./build/lambda/build/${functionName}`;
        if (fileExists(buildDir)) {
          console.error('Duplicate Function: ' + functionName);
          continue;
        }

        await fs.mkdir(buildDir);

        await Promise.all([
          fs.writeFile(`${buildDir}/Dockerfile`, LambdaDockerfile),
          fs.writeFile(`${buildDir}/.dockerignore`, LambdaDockerignore),
          fs.writeFile(`${buildDir}/index.mjs`, LambdaEntrypoint),
          fs.copyFile(`./build/lambda/src/${file}`, `${buildDir}/handler.mjs`)
        ]);

        // await fs.copyFile('./package.json', `${buildDir}/package.json`);
        const packageJson = JSON.parse((await fs.readFile('./package.json')).toString('utf-8'));
        packageJson['dependencies']['squid-ssr'] = '^0.0.8';
        await fs.writeFile(`${buildDir}/package.json`, JSON.stringify(packageJson));

        // console.log(`-t${opts.registry ? opts.registry + '/' : ''}${(opts.prefix ? opts.prefix.replace(/\/?$/, '/') : '')}${functionName}:latest`);

        if (opts.docker)
          await exec('docker', [
            'build',
            buildDir,
            `-t${opts.registry ? opts.registry + '/' : ''}${(opts.prefix ? opts.prefix.replace(/\/?$/, '/') : '')}${functionName}:latest`
          ], {
            cwd: process.cwd(),
            stdio: "inherit"
          });
      }

    });

  lambda.command('push')
    .description('push built functions into the registry')
    .action(async () => {
      const lambdaDir = (await fs.readdir('./build/lambda/build', { withFileTypes: true }))
        .filter(f => f.isDirectory())
        .map(dir => dir.name);

      const config = fileExists('./build/lambda/build/config.json') ?
        JSON.parse((await fs.readFile('./build/lambda/build/config.json')).toString('utf8')) : {};

      for (const functionName of lambdaDir) {
        await exec('docker', [
          'push',
          `${config.registry ? config.registry + '/' : ''}${(config.prefix ? config.prefix.replace(/\/?$/, '/') : '')}${functionName}:latest`
        ], {
          cwd: process.cwd(),
          stdio: "inherit"
        });
      }
    });

  lambda.command('deploy')
    .description('executed on the server running openfaas. Deploys the functions to openfaas')
    .action(async () => {
      const lambdaDir = (await fs.readdir('./build/lambda/build', { withFileTypes: true }))
        .filter(f => f.isDirectory())
        .map(dir => dir.name);

      const config = fileExists('./build/lambda/build/config.json') ?
        JSON.parse((await fs.readFile('./build/lambda/build/config.json')).toString('utf8')) : {};


      for (const functionName of lambdaDir) {
        await exec('faas-cli', [
          'deploy',
          `--image`,
          `${config.registry ? config.registry + '/' : ''}${(config.prefix ? config.prefix.replace(/\/?$/, '/') : '')}${functionName}:latest`,
          `--name`, `${functionName}`,
          `--gateway`, config.gateway ?? 'http://127.0.0.1:8080',
        ], {
          cwd: process.cwd(),
          stdio: "inherit"
        });
      }
    });


  program
    .command('generate')
    .alias('g')
    // .argument('<type>', 'What component to generate. (component, page, api)')
    .option('-c, --component', 'generate a new preact function component')
    .option('-p, --page', 'generate a new page')
    .option('-a, --api-endpoint', 'generate a new api endpoint')
    .option('-l, --lambda', 'generate a new serverless lambda function')
    .argument('<path>', 'Where to generate the component')
    .description('Generate new components, pages or API endpoints.')
    .action(async (path, opts) => {
      if (!path) throw new Error('No path was given');
      if (typeof path !== 'string') throw new Error('Invalid path: ' + path);

      const writeFile = (path: string, content: string) => {
        if (fileExists(path)) throw new Error('File already exists!');
        fs.writeFile(path, content);
      };

      if (opts.component) {
        try {
          const fullPath = './src/components/' + path;
          await createDirectory(fullPath);
          await writeFile((fullPath).replace(/(.tsx)?$/, '.tsx'), ComponentTemplate.replace('%COMPONENT_NAME%', path.split('/').at(-1) ?? 'Component'));
        } catch (e) {
          console.log(e);
          throw new Error((e as Error).message || 'Invalid path');
        }
        return;
      }

      if (opts.page) {
        try {
          const fullPath = './src/pages/' + path;
          await createDirectory(fullPath);
          await writeFile((fullPath).replace(/(.tsx)?$/, '.tsx'), `import type {ServerSideProps} from '@/pages/${(path).replace(/(.tsx)?$/, '.props')}'\n${PageTemplate}`);
          await writeFile((fullPath).replace(/(.tsx)?$/, '.props.ts'), PropsTemplate);
        } catch (e) {
          throw new Error((e as Error).message || 'Invalid path');
        }

        return;
      }

      if (opts.apiEndpoint) {
        try {
          const fullPath = './src/pages/' + path;
          await createDirectory(fullPath);
          await writeFile((fullPath).replace(/(.ts)?$/, '.ts'), ApiTemplate);
        } catch (e) {
          throw new Error((e as Error).message || 'Invalid path');
        }
        return;
      }

      if (opts.lambda) {
        try {
          const fullPath = './src/lambda/' + path;
          await createDirectory(fullPath);
          await writeFile((fullPath).replace(/(.ts)?$/, '.ts'), LambdaFunctionTemplate);
        } catch (e) {
          throw new Error((e as Error).message || 'Invalid path');
        }
        return;
      }

      throw new Error('Invalid or no type');
    });

  program.parse();
})();

async function createDirectory(path: string) {
  try {
    await fs.mkdir(path.replace(/\/([^\/]+)\/?$/, ''), { recursive: true });
  } catch (e) {
  }
}

function exec(cmd: string, args: string[], options: SpawnOptions) {
  const process = spawn(cmd, args, options);
  process.addListener('error', e => console.log(e));
  return new Promise<void>(resolve => process.addListener('exit', () => resolve()));
} 