// @ts-nocheck
import { ProxyAgent } from "undici";

export function makeProxyFetch(proxyUrl: string): typeof fetch {
  const agent = new ProxyAgent(proxyUrl);
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const base = init ? { ...init } : {};
    return fetch(input, { ...base, dispatcher: agent });
  };
}
