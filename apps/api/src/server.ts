import { buildApp } from './http/app';
import { buildContainer } from './container';

const container = await buildContainer();
const app = await buildApp(container);

await app.listen({ host: container.cfg.http.host, port: container.cfg.http.port });
app.log.info(
  `LEST API listening on http://${container.cfg.http.host}:${container.cfg.http.port} (mode=${container.cfg.mode})`,
);
