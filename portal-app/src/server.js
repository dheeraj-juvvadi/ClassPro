import { createApp } from './app.js';
import { PortalSession, closeBrowser } from './portal.js';
import { closeOcrWorker } from './ocr-worker.js';

const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || '127.0.0.1';
const { app, close } = createApp({
  createSession: () => new PortalSession(),
  maxSessions: Number(process.env.MAX_SESSIONS || 8),
  secureCookie: process.env.COOKIE_SECURE === '1',
});
const server = app.listen(port, host, () => console.log(`Student Portal app: http://${host}:${port}`));
async function shutdown() {
  server.close();
  closeOcrWorker();
  await close();
  await closeBrowser();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
