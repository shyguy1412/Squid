import { ErrorReporterPlugin } from "@/lib/plugins/ErrorReporterPlugin";
import { CompileOptions } from "@/modules/compiler";
import { parse } from "acorn";
import { simple as walk } from "acorn-walk";
import { generate } from "astring";
import { context, Plugin } from "esbuild";
import fs from "fs/promises";
import path from "path";

const ClientPlugin: Plugin = {
  name: 'ClientPlugin',
  setup(build) {

    //we assume imports wont have side effects. This allows for aggressive tree shaking
    //modules shouldnt have side effects anyway, so idc if this is bad
    build.onResolve({ filter: /.*/ }, (options) => {
      return { sideEffects: false };
    });

    //filter acts on absolute path so this work around is needed to act on it relatively
    build.onLoad({ filter: new RegExp(`^${path.resolve(".")}/src/pages.*`) }, async (options) => {
      const file = await fs.readFile(options.path);

      const js = await build.esbuild.transform(file, {
        loader: "tsx",
        jsxFactory: build.initialOptions.jsxFactory,
        jsxFragment: build.initialOptions.jsxFragment,
        //export h and hydrate for rendering
        //this way we dont need to figure out where preact is located (probably some hashed split)
        //ugly but works good enough
      }).then(({ code }) => code + '\nexport {h, hydrate} from "preact";');

      const ast = parse(js, { sourceType: "module", ecmaVersion: "latest" });

      //never refers to the state, I dont need state for this
      walk<never>(ast, {
        ExportNamedDeclaration(node) {
          if (!node.declaration) return;
          if (node.declaration.type == "ClassDeclaration") return;

          //for export const expression
          if (node.declaration.type == "VariableDeclaration") {

            //filter out the getServerSideProps declaration
            node.declaration.declarations = node.declaration.declarations.filter(node => {
              if (node.id.type != "Identifier") return true;
              if (node.id.name != "getServerSideProps") return true;
              return false;
            });

            //without variable declarations, remove the export declaration
            //varaible declaration without declarations is invalid syntax
            if (node.declaration.declarations.length == 0) {
              //@ts-ignore
              node.declaration = null;
            }

            return;
          }

          //at this point we know we have a function declaration
          if (node.declaration.id.name != "getServerSideProps") return;

          //@ts-ignore
          node.declaration = null;
        }
      });

      console.log(generate(ast));

      return {
        contents: generate(ast, {})
      };
    });
  },

};

export async function getClientContext(options: CompileOptions) {
  return await context({
    ...options,

    entryPoints: ['./src/pages/**/*.tsx'],
    plugins: [
      ClientPlugin,
      ErrorReporterPlugin,
    ],
    outbase: './src/pages',
    outdir: './build/pages/',
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    logLevel: 'silent',
    metafile: true,
    treeShaking: true,
    alias: { 'react': 'preact/compat' },
  });
}
