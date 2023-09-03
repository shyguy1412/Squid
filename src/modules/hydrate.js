(async () => {
  //preact doesnt like the doctype element
  //so we remove it during hydration and add it back after
  //a bit hacky but it works
  const doctype = document.querySelector('html').previousSibling;
  doctype.remove();
  const appPath = window.location.pathname + "?hydrate";
  const { default: App, h, hydrate } = await import(appPath);
  hydrate(h(App, {
    ...(window['squid-ssr-props'] ?? {})
  }), document);
  document.prepend(doctype);
})();