import type { FastifyInstance } from "fastify";

type DiscoveryInput = {
  issuer: string;
};

export async function registerDiscoveryRoutes(
  app: FastifyInstance,
  input: DiscoveryInput
): Promise<void> {
  app.get("/.well-known/openid-configuration", async () => {
    return {
      issuer: input.issuer,
      authorization_endpoint: `${input.issuer}/protocol/openid-connect/auth`,
      token_endpoint: `${input.issuer}/protocol/openid-connect/token`,
      jwks_uri: `${input.issuer}/protocol/openid-connect/certs`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      scopes_supported: ["openid", "profile", "email", "roles", "offline_access"],
      claims_supported: [
        "iss",
        "aud",
        "sub",
        "exp",
        "iat",
        "scope",
        "realm_access",
        "resource_access"
      ]
    };
  });
}
