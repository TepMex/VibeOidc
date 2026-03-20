import { generateKeyPair, exportJWK, exportSPKI, importJWK, SignJWT, type JWK } from "jose";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import Provider, { type Configuration } from "oidc-provider";

import type { AppConfig } from "../config/env.js";
import type { TestUser } from "../config/users.js";

type LoginBody = {
  username?: string;
};

const SELECTED_USER_COOKIE = "vibe_selected_user";

type UserIndex = {
  byUsername: Map<string, TestUser>;
  bySub: Map<string, TestUser>;
  allScopes: string[];
};

function makeUserIndex(users: TestUser[]): UserIndex {
  const byUsername = new Map<string, TestUser>();
  const bySub = new Map<string, TestUser>();
  const scopeSet = new Set<string>();

  for (const user of users) {
    byUsername.set(user.username, user);
    bySub.set(user.sub, user);
    for (const scope of user.scopes) {
      scopeSet.add(scope);
    }
  }

  const allScopes = ["openid", ...Array.from(scopeSet).filter((scope) => scope !== "openid")];
  return { byUsername, bySub, allScopes };
}

async function createJwks(): Promise<{ keys: JWK[]; publicKeyPem: string }> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(privateKey);
  const publicKeyPem = await exportSPKI(publicKey);

  return {
    keys: [
      {
        ...jwk,
        alg: "RS256",
        use: "sig",
        kid: "local-dev-rs256"
      }
    ],
    publicKeyPem
  };
}

function getUserSelectionHtml(uid: string, users: TestUser[]): string {
  const buttons = users
    .map(
      (user) =>
        `<button type="submit" name="username" value="${user.username}" style="padding:8px 12px;cursor:pointer;">Login as ${user.username}</button>`
    )
    .join("<br/><br/>");

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"/><title>Login as test user</title></head>
  <body style="font-family: sans-serif; margin: 2rem; max-width: 640px;">
    <h1>Login as test user</h1>
    <p>Select a configured user to continue the OIDC flow.</p>
    <form method="post" action="/login/${uid}">
      ${buttons}
    </form>
  </body>
</html>`;
}

export async function setupOidcProvider(
  app: FastifyInstance,
  config: AppConfig,
  users: TestUser[]
): Promise<Provider> {
  const userIndex = makeUserIndex(users);
  let selectedUsername = users[0]?.username;
  const jwks = await createJwks();
  const jwtPublicKeyPem = jwks.publicKeyPem;
  const signingJwk = jwks.keys[0];
  const signingKey = await importJWK(signingJwk, "RS256");

  const oidcConfig: Configuration = {
    clients: [
      {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_post",
        redirect_uris: [config.redirectUri]
      }
    ],
    jwks,
    pkce: {
      required: () => false
    },
    features: {
      devInteractions: { enabled: false }
    },
    formats: {
      AccessToken: "jwt"
    },
    scopes: userIndex.allScopes,
    interactions: {
      url: (_ctx, interaction) => `/login/${interaction.uid}`
    },
    extraTokenClaims: async (ctx) => {
      const accountId = ctx.oidc?.session?.accountId;
      if (!accountId) {
        return {};
      }

      const user = userIndex.bySub.get(accountId);
      if (!user) {
        return {};
      }

      return {
        scope: user.scopes.join(" "),
        realm_access: { roles: user.realmRoles ?? [] },
        resource_access: Object.fromEntries(
          Object.entries(user.clientRoles ?? {}).map(([clientId, roles]) => [clientId, { roles }])
        )
      };
    },
    claims: {
      openid: ["sub"],
      profile: ["preferred_username"],
      email: ["email"],
      roles: ["realm_access", "resource_access"]
    },
    findAccount: async (_ctx, accountId) => {
      const user = userIndex.bySub.get(accountId);
      if (!user) {
        return undefined;
      }

      return {
        accountId: user.sub,
        claims: async () => ({
          sub: user.sub,
          preferred_username: user.username,
          email: user.email,
          realm_access: { roles: user.realmRoles ?? [] },
          resource_access: Object.fromEntries(
            Object.entries(user.clientRoles ?? {}).map(([clientId, roles]) => [clientId, { roles }])
          )
        })
      };
    }
  };

  const provider = new Provider(config.issuer, oidcConfig);
  const oidcCallback = provider.callback();

  app.get("/login/:uid", async (request, reply) => {
    const { uid } = request.params as { uid: string };
    const details = await provider.interactionDetails(request.raw, reply.raw);

    if (details.uid !== uid) {
      return reply.code(400).type("text/plain").send("Invalid interaction uid");
    }

    reply.type("text/html").send(getUserSelectionHtml(uid, users));
  });

  app.post("/login/:uid", async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const { uid } = request.params as { uid: string };
    const selectedUsernameInput = request.body?.username;

    if (!selectedUsernameInput || !userIndex.byUsername.has(selectedUsernameInput)) {
      return reply.code(400).type("text/plain").send("Unknown user selection");
    }

    const details = await provider.interactionDetails(request.raw, reply.raw);
    if (details.uid !== uid) {
      return reply.code(400).type("text/plain").send("Invalid interaction uid");
    }

    const user = userIndex.byUsername.get(selectedUsernameInput);
    if (!user) {
      return reply.code(400).type("text/plain").send("Unknown user");
    }
    selectedUsername = user.username;

    const result = {
      login: { accountId: user.sub },
      consent: {}
    };

    reply.setCookie(SELECTED_USER_COOKIE, user.username, {
      path: "/",
      httpOnly: true,
      sameSite: "lax"
    });

    await provider.interactionFinished(request.raw, reply.raw, result, {
      mergeWithLastSubmission: false
    });

    return reply.hijack();
  });

  function getSelectedUserFromRequest(request: FastifyRequest): TestUser | undefined {
    const cookieUsername = request.cookies?.[SELECTED_USER_COOKIE];
    const candidate = cookieUsername ?? selectedUsername;
    if (!candidate) {
      return undefined;
    }
    return userIndex.byUsername.get(candidate);
  }

  async function issueTokensForSelectedUser(request: FastifyRequest, reply: FastifyReply) {
    const user = getSelectedUserFromRequest(request);
    if (!user) {
      return reply.code(400).send({
        error: "no_selected_user",
        error_description: "Select a user first from /ui authorize flow."
      });
    }

    selectedUsername = user.username;
    const now = Math.floor(Date.now() / 1000);
    const scope = user.scopes.join(" ");
    const realmAccess = { roles: user.realmRoles ?? [] };
    const resourceAccess = Object.fromEntries(
      Object.entries(user.clientRoles ?? {}).map(([clientId, roles]) => [clientId, { roles }])
    );

    const accessToken = await new SignJWT({
      scope,
      realm_access: realmAccess,
      resource_access: resourceAccess
    })
      .setProtectedHeader({ alg: "RS256", kid: "local-dev-rs256", typ: "JWT" })
      .setIssuer(config.issuer)
      .setAudience(config.defaultAudience)
      .setSubject(user.sub)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(signingKey);

    const idToken = await new SignJWT({
      email: user.email,
      preferred_username: user.username,
      realm_access: realmAccess,
      resource_access: resourceAccess
    })
      .setProtectedHeader({ alg: "RS256", kid: "local-dev-rs256", typ: "JWT" })
      .setIssuer(config.issuer)
      .setAudience(config.clientId)
      .setSubject(user.sub)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(signingKey);

    return reply.send({
      token_type: "Bearer",
      expires_in: 3600,
      scope,
      access_token: accessToken,
      id_token: idToken
    });
  }

  app.post("/ui/token", issueTokensForSelectedUser);
  app.post("/protocol/openid-connect/token", issueTokensForSelectedUser);

  // Test override endpoints:
  // always return selected user roles regardless of provided token value.
  app.route({
    method: ["GET", "POST"],
    url: "/protocol/openid-connect/userinfo",
    handler: async (request, reply) => {
      const user = getSelectedUserFromRequest(request);
      if (!user) {
        return reply.code(400).send({
          error: "no_selected_user",
          error_description: "No selected user. Choose one via /ui."
        });
      }

      selectedUsername = user.username;
      return reply.send({
        sub: user.sub,
        preferred_username: user.username,
        email: user.email,
        scope: user.scopes.join(" "),
        realm_access: { roles: user.realmRoles ?? [] },
        resource_access: Object.fromEntries(
          Object.entries(user.clientRoles ?? {}).map(([clientId, roles]) => [clientId, { roles }])
        )
      });
    }
  });

  app.post("/protocol/openid-connect/token/introspect", async (request, reply) => {
    const user = getSelectedUserFromRequest(request);
    if (!user) {
      return reply.code(400).send({
        active: false,
        error: "no_selected_user",
        error_description: "No selected user. Choose one via /ui."
      });
    }

    selectedUsername = user.username;
    const now = Math.floor(Date.now() / 1000);
    return reply.send({
      active: true,
      sub: user.sub,
      username: user.username,
      scope: user.scopes.join(" "),
      aud: config.defaultAudience,
      iss: config.issuer,
      iat: now,
      exp: now + 3600,
      realm_access: { roles: user.realmRoles ?? [] },
      resource_access: Object.fromEntries(
        Object.entries(user.clientRoles ?? {}).map(([clientId, roles]) => [clientId, { roles }])
      )
    });
  });

  // Backend compatibility helpers for systems configured with Issuer + JwtPublicKey.
  app.get("/protocol/openid-connect/jwt-public-key", async (_request, reply) => {
    reply.type("text/plain").send(jwtPublicKeyPem);
  });

  app.get("/protocol/openid-connect/backend-config", async (_request, reply) => {
    return reply.send({
      issuer: config.issuer,
      jwtPublicKey: jwtPublicKeyPem,
      jwtPublicKeyUrl: `${config.issuer}/protocol/openid-connect/jwt-public-key`,
      jwksUrl: `${config.issuer}/protocol/openid-connect/certs`
    });
  });

  app.all("/protocol/openid-connect/*", async (request, reply) => {
    oidcCallback(request.raw, reply.raw);
    return reply.hijack();
  });

  app.all("/.well-known/*", async (request, reply) => {
    oidcCallback(request.raw, reply.raw);
    return reply.hijack();
  });

  return provider;
}
