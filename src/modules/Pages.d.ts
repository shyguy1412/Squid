export type SquidModuleMap = {
  [key: string]: SquidModuleMap | import('@/modules/express').SquidModule;
};

declare module "squid-ssr/pages" {
  const moduleMap: SquidModuleMap;
  export default moduleMap;
}