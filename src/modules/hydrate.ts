async function hydrateSquid(){
  const appPath = '/pages/' + window.location.pathname + '/index.mjs';
  const {default: App, h, hydrate} = await import(appPath);
  console.log(App);
  
  hydrate(h(App, {}), document);
}

hydrateSquid();