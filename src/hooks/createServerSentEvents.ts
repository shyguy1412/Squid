import type { Request, Response } from "express";

class ServerSentEventStream extends EventTarget {
  _req: Request;
  _res: Response;

  constructor(req: Request, res: Response) {
    super();
    this._req = req;
    this._res = res;

    const headers = {
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache'
    };
    res.writeHead(200, headers);

    res.on('close', () => { this.dispatchEvent(new Event('close')); });
  }

  close() {
    this._res.write(`event: close\ndata: \n\n`);
  }
  send(event: string, data?: any) {
    this._res.write(`data: ${JSON.stringify({ event, data })}\n\n`);
  }
}

export function createServerSentEventStream(req: Request, res: Response) {

  return new ServerSentEventStream(req, res);
}