import express from "express";
import { basename, join, resolve } from "path";
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { Response, Request } from "express-serve-static-core";
import { readFile } from "fs/promises";
import { JSX } from "preact";

const app = express();

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable("x-powered-by");

const port = process.env.PORT || 3000;

function isStaticRequest(path: string) {
  const pathFragments = path.split('/');
  return (/.*\..+/).test(pathFragments[pathFragments.length - 1]);
}


async function serveStatic(req: Request, res: Response) {
  const staticPath = './build' + req.originalUrl;

  if (!existsSync(staticPath)) {
    res.status(404);
    res.send('Static content not found: ' + resolve(staticPath));
    return;
  }

  res.contentType(basename(staticPath).replaceAll('.mjs', '.js'));

  res.send(await readFile(staticPath));
}


app.get('/*', async (req, res) => {
  if (isStaticRequest(req.originalUrl)) {
    await serveStatic(req, res);
    return;
  }

  const documentPath = resolve(process.cwd(), 'build/pages', 'document.mjs');
  const appPath = join(process.cwd(), 'build/pages', req.originalUrl == '/' ? '' : req.originalUrl, 'index.mjs');

  if (!existsSync(appPath)) {

    res.status(404);
    res.send('Page not found: ' + appPath);
    return;
  }

  const { default: App, h, render} = await import(pathToFileURL(appPath).toString()) as {
    default: () => JSX.Element,
    h: typeof import('preact').h,
    render: typeof import('preact-render-to-string').render
  };

  const renderedHTML = render(h(App, {}))
    .replace('<head>', '<head><script src="/hydrate.js" defer></script>');

  res.send(renderedHTML);

});

export const server = {
  start: () => {
    app.listen(port, () => {
      console.log(`✅ Express server listening on port ${port}`);
    });
  }
};
