import { formatMessages, Plugin } from "esbuild";

export const ErrorReporterPlugin: Plugin = {
  name: "ErrorReporterPlugin",
  setup(pluginBuild) {
    //Listener for error message and information
    pluginBuild.onEnd(async result => {
      if (result.errors.length == 0) return;

      const formatted = await formatMessages(result.errors, {
        kind: 'error',
        color: true,
        terminalWidth: 100,
      });

      console.log(formatted.join('\n'));
      console.log(`${result.errors.length} ${result.errors.length == 1 ? 'error' : 'errors'}`);
    });
  },
};