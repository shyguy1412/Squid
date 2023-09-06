import type { Request, Response } from "express";

export function createServerSentEventStream(req: Request, res: Response) {
  const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
  };
  res.writeHead(200, headers);

  return {
    close: () => {
      res.write(`event: close\ndata: \n\n`);
    },
    dispatch: (event: string, data?: any) => {
      res.write(`data: ${JSON.stringify({ event, data })}\n\n`);
    }
  };
}

interface CustomEventListener{
  (ev: CustomEvent): void;
}

interface CustomEventListenerObject {
  handleEvent(object: CustomEvent): void;
}

interface CustomEventTarget {
  addEventListener(
    type: string,
    listener: CustomEventListener | CustomEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ): void;
  /** Dispatches a synthetic event event to target and returns true if either event's cancelable attribute value is false or its preventDefault() method was not invoked, and false otherwise. */
  dispatchEvent(event: CustomEvent): boolean;
  /** Removes the event listener in target's event listener list with the same type, callback, and options. */
  removeEventListener(
    type: string,
    listener: CustomEventListener | CustomEventListenerObject,
    options?: EventListenerOptions | boolean,
  ): void;
}

export function useServerSentEvents(source: string): CustomEventTarget {
  if (!('window' in globalThis)) return new EventTarget() as CustomEventTarget;
  const events = new EventSource(source);
  const target = new EventTarget();
  events.addEventListener('close', () => events.close());
  events.addEventListener('message', (e) => {
    const data = JSON.parse(e.data);
    target.dispatchEvent(new CustomEvent(data.event, { detail: data.data }));
  });
  return target as CustomEventTarget;
}