declare module '*.css' {}
declare module '@fontsource-variable/*' {}
declare module '@fontsource/*' {}
declare module 'https-proxy-agent' {
  import { Agent } from 'http';
  export class HttpsProxyAgent<T extends string | URL = string | URL> extends Agent {
    constructor(proxy: T, opts?: Record<string, unknown>);
  }
  export default HttpsProxyAgent;
}
