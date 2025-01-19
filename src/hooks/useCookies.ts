import { Request, Response } from "express";


export function useCookies(req: Request, res: Response) {
  if (!req.cookies) {
    console.warn("⚠️ Request.cookies is undefined, reading cookies will not work.\nIs a cookie-parser middleware installed?");
  }

  const newCookies: Cookie[] = [];
  const cookies: { [k: string]: any; } = {};

  for (const k in req.cookies) {
    try {
      cookies[k] = JSON.parse(req.cookies[k]);
    } catch {
      cookies[k] = req.cookies[k];
    }
  }

  return {
    ...cookies,
    add(cookie: Cookie) {
      newCookies.push(cookie);
      res.setHeader('Set-Cookie', newCookies.map(c => createCookieHeader(c)));
    },
    remove(cookie: string) {
      this.add({
        key: cookie,
        value: '',
        expires: new Date(0)
      });
    }
  } as {
    [key: string]: any,
    add(cookie: Cookie): void;
    remove(cookie: string): void;
  };

}
interface Cookie {
  key: any,
  value: any,
  expires?: Date,
  httpOnly?: boolean,
  secure?: boolean,
  path?: string,
  sameSite?: 'Strict' | 'None' | 'Lax',
  prefix?: '__Host-' | '__Secure-',
  domain?: string;
}

function createCookieHeader(cookie: Cookie) {
  return `\
${cookie.key}=${JSON.stringify(cookie.value)};\
${cookie.expires ? `Expires=${cookie.expires};` : ''}\
${cookie.httpOnly ? 'HttpOnly;' : ''}\
${cookie.secure ? 'Secure;' : ''}\
${cookie.path ? `Path=${cookie.path};` : ''}\
${cookie.sameSite ? `SameSite=${cookie.sameSite};` : ''}\
${cookie.prefix ? `Prefix=${cookie.prefix};` : ''}\
${cookie.domain ? `Domain=${cookie.domain};` : ''}\
  `;
}