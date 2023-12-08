(async () => {
  const appPath = window.location.pathname + "?hydrate";
  const { default: App, h, hydrate } = await import(appPath);
  hydrate(h(App, {
    ...(window['squid-ssr-props'] ?? {})
  }), document.body);
})();