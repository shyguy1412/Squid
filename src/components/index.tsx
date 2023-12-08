import { h, Fragment, ComponentChildren } from 'preact';
import { HTMLProps } from 'preact/compat';
import { createPortal } from 'preact/compat';

type Props = {
  children?: ComponentChildren;
};

export function Head({ children }: Props) {
  if (!('document' in globalThis)) return <head>
    <link rel="stylesheet" href="?style" />
  </head>;
  return createPortal(<>{children}</>, document.head);
}

export function Body({ children }: Props) {
  if (!('document' in globalThis)) return <body>{children}</body>;
  return <>{children}</>;
}

export function Html({ children, ...attributes }: Props & HTMLProps<HTMLHtmlElement>) {
  if (!('document' in globalThis)) return <html {...attributes}>
    {children}
  </html>;
  return <>{children}</>;
}
