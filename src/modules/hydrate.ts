async function hydrateSquid() {
  const appPath = './hydrate' + window.location.pathname;
  const { default: App, h, hydrate } = await import(appPath);
  hydrate(h(App, {}), document);
}

hydrateSquid();