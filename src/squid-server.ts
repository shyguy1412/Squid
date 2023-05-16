import express from "@/modules/express";
import { createSocket } from 'dgram';

const app = express();

const port = Number.parseInt(process.env.SQUID_PORT ?? '0') || 3000;

const ipcSocket = createSocket("udp4");

// Catching the message event
ipcSocket.on("message", function (msg) {

  if (msg.toString('utf-8') == 'exit')
    process.exit();

});

// Binding server with port
ipcSocket.bind(port + 1, 'localhost');

app.listen(port, () => {
  console.log(`✅ Express server listening on port ${port}`);
  ipcSocket.send('started', port - 1, 'localhost');
});
