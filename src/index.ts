import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import formBody from "@fastify/formbody";

import { loadConfig } from "./config/env.js";
import { loadUsersFromConfig } from "./config/users.js";
import { setupOidcProvider } from "./oidc/provider.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerUiRoutes } from "./routes/ui.js";

async function buildServer() {
  const config = loadConfig();
  const users = await loadUsersFromConfig();

  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"],
    credentials: true
  });
  await app.register(cookie);
  await app.register(formBody);

  await registerHealthRoutes(app);
  await registerUiRoutes(app, config, users);
  await setupOidcProvider(app, config, users);

  app.get("/", async () => {
    return {
      name: "vibe-oidc",
      status: "oidc-ready",
      issuer: config.issuer,
      usersLoaded: users.length
    };
  });

  return { app, config };
}

async function main() {
  const { app, config } = await buildServer();

  await app.listen({ host: config.host, port: config.port });
  app.log.info(`OIDC local provider running at ${config.issuer}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
