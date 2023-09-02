declare module "squid/pages" {
  const moduleMap: {
    [key: string]: typeof moduleMap | import('@/modules/express').SquidModule
  };
  export default moduleMap;
}