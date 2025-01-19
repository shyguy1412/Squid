import { getClientContext } from "@/modules/compiler/client";
import { getServerContext } from "@/modules/compiler/server";
import { existsSync as fileExists } from 'fs';
import fs from "fs/promises";
import type { BuildContext, BuildOptions } from "esbuild";

const OPTION_KEYS = Object.freeze([
  "plugins",
  "minify",
  "loader",
  "preserveSymlinks",
  "external",
  "alias",
  "banner",
  "footer",
  "splitting",
] as const);
type OptionKeys = typeof OPTION_KEYS;
export type CompileOptions = Pick<BuildOptions, OptionKeys[number]>;

export async function context(options: CompileOptions) {
  // @ts-ignore key arrays are hella annoying to type
  // this just copies all allowed option keys into a new object
  const sanitized_options = OPTION_KEYS.reduce((prev, cur) => (prev[cur] = options[cur], prev), {});


  if (fileExists('./build')) {
    await fs.rm('./build', { recursive: true });
  }

  await fs.mkdir('./build');

  const contexts = await Promise.all([
    getServerContext(sanitized_options),
    getClientContext(sanitized_options),
    // compileClient(options, sharedState),
  ]) as BuildContext[];

  //eww, yucky for each. very gross. looks nice here tho...
  return {
    watch: () => contexts.forEach(c => c.watch()),
    rebuild: () => contexts.forEach(c => c.rebuild()),
    dispose: () => contexts.forEach(c => c.dispose()),
  };
}

/*

//Listener for success message and build information
    pluginBuild.onEnd(result => {
      if (result.errors.length > 0) return;

      const formatOutputFiles = (output: Metafile['outputs']): string[] => {
        const files = Object.keys(output);
        return files.map(file => `  \x1b[33m•\x1b[0m ${file} \x1b[32m${formatBytes(output[file].bytes)}\x1b[0m`);
      };

      console.log();
      console.log(formatOutputFiles(metafiles.pages!.outputs).join('\n'));
      console.log(formatOutputFiles(metafiles.api!.outputs).join('\n'));
      console.log(formatOutputFiles(metafiles.lambda!.outputs).join('\n'));
      console.log(formatOutputFiles(result.metafile!.outputs).join('\n'));
      console.log();
      console.log(`Frontend:   \x1b[32m${formatBytes([
        ...Object.values(metafiles.pages!.outputs).map(v => v.bytes),
      ].reduce((prev, cur) => prev + cur))}\x1b[0m`);
      console.log(`Backend:    \x1b[32m${formatBytes([
        ...Object.values(metafiles.api!.outputs).map(v => v.bytes),
        ...Object.values(result.metafile!.outputs).map(v => v.bytes),
      ].reduce((prev, cur) => prev + cur))}\x1b[0m`);
      if(Object.values(metafiles.lambda!.outputs).length)console.log(`Lambda:    \x1b[32m${formatBytes([
        ...Object.values(metafiles.lambda!.outputs).map(v => v.bytes),
      ].reduce((prev, cur) => prev + cur))}\x1b[0m`);
      console.log(`Total size: \x1b[32m${formatBytes([
        ...Object.values(metafiles.pages!.outputs).map(v => v.bytes),
        ...Object.values(metafiles.api!.outputs).map(v => v.bytes),
        ...Object.values(result.metafile!.outputs).map(v => v.bytes),
      ].reduce((prev, cur) => prev + cur))}\x1b[0m`);
      console.log(`⚡ \x1b[32mDone in \x1b[33m${Date.now() - startTime}ms\x1b[0m`);
      console.log();
    });

*/