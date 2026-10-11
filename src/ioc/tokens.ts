export type Token<T = any> = string | symbol | (new (...args: any[]) => T);

export const DATABASE: Token<any> = Symbol.for("veap:kernel:database");
export const APP_PLUGINS: Token<any[]> = Symbol.for("veap:kernel:app-plugins");
export const APP_MIGRATIONS: Token<any[]> = Symbol.for(
  "veap:kernel:app-migrations",
);
export const CLI_SERVICE: Token<any> = Symbol.for("veap:kernel:cli-service");
export const AUTH_ROUTES: Token<any> = Symbol.for("veap:auth:routes");
export const ROUTER_SERVICE: Token<any> = Symbol.for("veap:router:service");
export const SITE_LAYOUT: Token<any> = Symbol.for("veap:router:site-layout");
