import express from "express";
import path from "path";
import { existsSync } from 'fs';
import { render } from "preact-render-to-string";
import { pathToFileURL } from 'url';
import { h } from 'preact';
import { Response, Request } from "express-serve-static-core";
import { readFile } from "fs/promises";

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

  console.log(staticPath);
  
  if (!existsSync(staticPath)) {
    res.status(404);
    res.send('Static content not found: ' + path.resolve(staticPath));
    return;
  }

  console.log(path.basename(staticPath).replaceAll('.mjs', '.js'));

  res.contentType(path.basename(staticPath).replaceAll('.mjs', '.js'));

  res.send(await readFile(staticPath));
}


app.get('/*', async (req, res) => {
  if (isStaticRequest(req.originalUrl)) {
    await serveStatic(req, res);
    return;
  }

  const documentPath = path.resolve(process.cwd(), 'build', 'document.mjs');
  const appPath = path.join(process.cwd(), 'build/pages', req.originalUrl == '/' ? '' : req.originalUrl, 'index.mjs');

  if (!existsSync(appPath)) {

    res.status(404);
    res.send('Page not found: ' + appPath);
    return;
  }

  const { default: Document } = await import(pathToFileURL(documentPath).toString());
  const { default: App } = await import(pathToFileURL(appPath).toString());

  res.send(render(h(Document, {
    PageContent: App
  }), {}));
});

export function createSquidServer() {
  return {
    start: () => {
      app.listen(port, () => {
        console.log(`✅ Express server listening on port ${port}`);
      });
    }
  }
}

createSquidServer().start();