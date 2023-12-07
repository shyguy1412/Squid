import { Plugin } from "esbuild";
import fs from 'fs/promises';

/**
 * Exports the functions neccissary for server side rendering and hydration from a page
 */
export const ExportRenderPlugin: Plugin = {
  name: 'ExportRenderPlugin',
  setup(pluginBuild) {


  }
};