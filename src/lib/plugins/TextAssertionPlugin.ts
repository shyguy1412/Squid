import { Plugin } from "esbuild";
import fs from "fs/promises";

export const TextPlugin: Plugin = {
  name: 'TextPlugin',
  setup(pluginBuild) {

    pluginBuild.onLoad({ filter: /.*/ }, async (opts) => {
      if (opts.with.type == 'text') {
        const file = await fs.readFile(opts.path, { encoding: 'utf8' });
        return {
          contents: file,
          loader: 'text'
        };
      }
    });
  }
};