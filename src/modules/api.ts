import { Request, Response } from "express";
export type ApiHandler = (req: Request, res: Response) => void;