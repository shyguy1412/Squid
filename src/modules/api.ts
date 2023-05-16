import { Request, Response } from "express";
export type SquidApiRequest = Request & { queryParams: { [key: string]: string; }; };
export type ApiHandler = (req: SquidApiRequest, res: Response) => void;