# Squid SSR

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Welcome to Squid SSR! This framework is heavily inspired by Next.js but designed to be less restricting with the backend.  

In essence, Squid is just an Express middleware that takes care of the routing and parsing of dynamic routes.
Every page will be compiled into an independent JavaScript bundle. Files that end with '.ts' instead of '.tsx' will be handled as API endpoints.  

## Features

- Next.js-inspired routing system for handling multi-page applications.
- Server-side rendering with Preact.
- Easily extendable with Express middleware.

## Getting Started

### Installation

To initiliase a Squid project, you can use npm :

```bash
npm init squid-ssr
```

### Usage

Like in Next.js, the routing of your page will reflect the structure of the pages directory.
You can create dynamic paths by using curly braces:  

```tsx
// src/pages/@{user}.tsx

import { h, Fragment } from 'preact';
import {Request, Response} from 'express';

export function getServerSideProps(req:Request, _res:Response) {
  return {
    props: {
      //parameters from dynamic paths will be made available in the Request.params object
      name: req.params.user
    }
  };
}

type Props = {

} & ReturnType<typeof getServerSideProps>['props']

export default function App({name}:Props) {
  return <>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Home of {name}</title>
  </head>
  <body>
    <span>This is {name}'s page!</span>
  </body>
  </html>
  </>;
}

```

It works the same for API endpoints.

The entrypoint for a Squid application will always be under src/main.ts and might look like the following:

```typescript
import express from 'express';
import squid from 'squid-ssr';
import cookieParser from 'cookie-parser'; //3rd party middleware for cookie parsing

const port = Number.parseInt(process.env.SQUID_PORT ?? '0') || 3000;
const app = express();

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable('x-powered-by');

app.use(cookieParser());

app.use(squid());

app.get('*', (_req, res) => {
  res.status(404).send('Page not found');
});

app.listen(port, () => {
  console.log(`✅ Express server listening on port ${port}`);
});
```

### Documentation

Still being made (maybe ¯\\_(ツ)_/¯ ).

### License

Squid SSR is open-source software licensed under the [MIT license](https://opensource.org/licenses/MIT).

### Acknowledgements

I would like to express my thanks to the following projects and communities that have greatly inspired and influenced Squid SSR:

- Next.js: [Link](https://nextjs.org)
- Preact: [Link](https://preactjs.com)

### Contact

If you have any questions, suggestions, or feedback, please feel free to contact me at nilsramstoeck@gmail.com.
