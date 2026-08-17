import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.PORT ?? 3000);
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../dist');

app.use(express.static(clientDist, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

app.listen(port, '0.0.0.0', () => {
  console.log(`IIMM Platform running on http://0.0.0.0:${port}`);
});
