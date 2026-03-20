import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

import type { AppConfig } from "../config/env.js";
import type { TestUser } from "../config/users.js";

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createAuthorizeUrl(config: AppConfig, scope: string): string {
  const url = new URL("/protocol/openid-connect/auth", config.issuer);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", randomUUID());
  url.searchParams.set("nonce", randomUUID());
  return url.toString();
}

function renderUiPage(config: AppConfig, users: TestUser[]): string {
  const userButtons = users
    .map((user) => {
      const scope = user.scopes.join(" ");
      const authorizeUrl = createAuthorizeUrl(config, scope);
      return `<div style="margin-bottom:12px;padding:12px;border:1px solid #ddd;border-radius:8px;">
  <div><strong>${htmlEscape(user.username)}</strong></div>
  <div style="font-size:12px;color:#555;margin:6px 0;">scope: ${htmlEscape(scope)}</div>
  <a href="${htmlEscape(authorizeUrl)}" style="display:inline-block;padding:8px 12px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">
    Start auth as ${htmlEscape(user.username)}
  </a>
</div>`;
    })
    .join("");

  const tokenEndpoint = `${config.issuer}/ui/token`;
  const callbackPath = new URL(config.redirectUri).pathname;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>VibeOIDC UI</title>
  </head>
  <body style="font-family: sans-serif; margin: 2rem; max-width: 900px;">
    <h1>VibeOIDC test UI</h1>
    <p>1) Start authorization for any test user. 2) After redirect, exchange the code for tokens.</p>
    <p><strong>Configured redirect URI:</strong> <code>${htmlEscape(config.redirectUri)}</code></p>
    <p><strong>If needed:</strong> set <code>OIDC_REDIRECT_URI=${htmlEscape(
      `${config.issuer}${callbackPath}`
    )}</code> so callback lands in this app.</p>

    <h2>Authorize</h2>
    ${userButtons}

    <h2>Token issue</h2>
    <p>This button ignores client credentials and grant type, and always issues a token for the currently selected UI user.</p>
    <form id="token-form">
      <button type="submit" style="padding:10px 14px;cursor:pointer;">Issue token for selected user</button>
    </form>

    <h3>Token response</h3>
    <pre id="token-output" style="background:#111;color:#ddd;padding:12px;border-radius:8px;white-space:pre-wrap;">No response yet.</pre>

    <h3>Decoded tokens</h3>
    <pre id="decoded-output" style="background:#0d2238;color:#d7ecff;padding:12px;border-radius:8px;white-space:pre-wrap;">No decoded token yet.</pre>

    <script>
      (function () {
        const output = document.getElementById("token-output");
        const decodedOutput = document.getElementById("decoded-output");
        const form = document.getElementById("token-form");
        function decodeBase64Url(value) {
          const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
          const pad = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
          const padded = normalized + "=".repeat(pad);
          return atob(padded);
        }

        function parseJwt(token) {
          const parts = token.split(".");
          if (parts.length < 2) {
            return null;
          }

          try {
            const header = JSON.parse(decodeBase64Url(parts[0]));
            const payload = JSON.parse(decodeBase64Url(parts[1]));
            return { header, payload };
          } catch (_error) {
            return null;
          }
        }

        function updateDecodedView(tokenResponse) {
          if (!tokenResponse || typeof tokenResponse !== "object") {
            decodedOutput.textContent = "No decoded token yet.";
            return;
          }

          const result = {};
          for (const key of ["access_token", "id_token", "refresh_token"]) {
            const value = tokenResponse[key];
            if (typeof value === "string") {
              result[key] = parseJwt(value) || { note: "Not a JWT or failed to decode" };
            }
          }

          if (Object.keys(result).length === 0) {
            decodedOutput.textContent = "No JWT token fields found in response.";
            return;
          }

          decodedOutput.textContent = JSON.stringify(result, null, 2);
        }

        form.addEventListener("submit", async function (event) {
          event.preventDefault();

          try {
            const response = await fetch("${htmlEscape(tokenEndpoint)}", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}"
            });

            const text = await response.text();
            let formatted = text;
            let parsed;
            try {
              parsed = JSON.parse(text);
              formatted = JSON.stringify(parsed, null, 2);
            } catch (_error) {
              // Keep raw response text for non-JSON errors.
              parsed = undefined;
            }
            output.textContent = formatted;
            updateDecodedView(parsed);
          } catch (error) {
            output.textContent = String(error);
            decodedOutput.textContent = "Failed to decode because token request failed.";
          }
        });
      })();
    </script>
  </body>
</html>`;
}

export async function registerUiRoutes(
  app: FastifyInstance,
  config: AppConfig,
  users: TestUser[]
): Promise<void> {
  app.get("/ui", async (_request, reply) => {
    reply.type("text/html").send(renderUiPage(config, users));
  });

  app.get("/ui/callback", async (_request, reply) => {
    reply.type("text/html").send(renderUiPage(config, users));
  });
}
