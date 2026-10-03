import express from '../../portal-app/node_modules/express/index.js';
import { fileURLToPath } from 'node:url';

const app = express();
app.get('/', (_request, response) => response.redirect('/design-preview/planner-calendar/'));
app.use('/design-preview', express.static(fileURLToPath(new URL('../', import.meta.url))));
for (const file of ['home-model.js', 'schedule-model.js', 'cally.4dcba6a3b8.js']) {
  app.get(`/portal-app/public/${file}`, (_request, response) => response.sendFile(fileURLToPath(new URL(`../../portal-app/public/${file}`, import.meta.url))));
}
app.listen(Number(process.env.PLANNER_PREVIEW_PORT || 4186), '127.0.0.1', () => {
  console.log(`Planner mockups: http://127.0.0.1:${process.env.PLANNER_PREVIEW_PORT || 4186}/`);
});
