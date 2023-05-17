import express from './modules/express';

export * from './modules/api';
export { Request, Response } from 'express';
export const app = express();