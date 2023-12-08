import { Plugin } from "esbuild";
import fs from 'fs/promises';

/**
 * Exports the functions neccissary for server side rendering and hydration from a page
 */
export const ExportRenderPlugin: Plugin = {
  name: 'ExportRenderPlugin',
  setup(pluginBuild) {

    pluginBuild.onLoad({ filter: /pages.*\.tsx$/ }, async (opts) => {
      const contents = (await fs.readFile(opts.path)).toString()
        + '\nexport {h, hydrate} from \'preact\';'
        + '\nexport {render} from \'preact-render-to-string\';';
        
      return {
        contents,
        loader: 'tsx',
      };
    });
  }
};