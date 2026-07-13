#!/usr/bin/env node
import net from "node:net";

const startPort = Number(process.argv[2] ?? process.env["PORT"] ?? 3000);
const host = process.argv[3];

if (!Number.isInteger(startPort) || startPort <= 0) {
  console.error(`Invalid start port: ${process.argv[2] ?? process.env["PORT"]}`);
  process.exit(1);
}

const tryListen = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once("error", () => resolve(false));
    server.listen({ port, host }, () => {
      server.close(() => resolve(port));
    });
  });

for (let port = startPort; port < startPort + 1000; port += 1) {
  // eslint-disable-next-line no-await-in-loop
  const freePort = await tryListen(port);
  if (freePort) {
    console.log(String(freePort));
    process.exit(0);
  }
}

console.error(`Unable to find a free port starting from ${startPort}`);
process.exit(1);
