import { Request } from "express";

export function useCookies(req:Request):any{
  if(!req.cookies){
    console.warn("⚠️ Request.cookies is undefined, reading cookies will not work.\nIs a cookie-parser middleware installed?")
  }
  console.log(req.cookies);
}