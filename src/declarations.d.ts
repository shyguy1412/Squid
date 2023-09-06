declare module "squid/pages" {
  const moduleMap: {
    [key: string]: typeof moduleMap | import('@/modules/express').SquidModule
  };
  export default moduleMap;
}

declare module "*.txt" {
  const content: string
  export default content;
}