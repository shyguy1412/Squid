import {h, hydrate} from 'preact';

async function hydrateSquid(){
  const appPath = '/pages/' + window.location.pathname + '/index.mjs';
  const {default: App} = await import(appPath);
  hydrate(h(App, {}), document.body);
}

export * from 'preact/hooks';

hydrateSquid();