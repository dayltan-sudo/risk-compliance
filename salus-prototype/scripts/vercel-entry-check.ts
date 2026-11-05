/**
 * Serves the Vercel entry point on a real Node http server. If `handle(app)`
 * is the Node-runtime shape Vercel expects, this behaves like the deployed
 * function: an http listener taking (req, res).
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import handler from '../api/index';

const server = createServer(handler as Parameters<typeof createServer>[1]);

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address() as AddressInfo;
console.log('function listening on', port);

for (const path of ['/api/health', '/api/summary', '/api/documents', '/api/session/portfolio']) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const text = await res.text();
  console.log(path, '->', res.status, text.slice(0, 100).replace(/\s+/g, ' '));
}

server.close();
