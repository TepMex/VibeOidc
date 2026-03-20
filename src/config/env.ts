import dotenv from "dotenv";

dotenv.config();

function mustGet(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export type AppConfig = {
  host: string;
  port: number;
  issuer: string;
  defaultAudience: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function loadConfig(): AppConfig {
  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? "4100"),
    issuer: mustGet("OIDC_ISSUER", "http://127.0.0.1:4100"),
    defaultAudience: mustGet("OIDC_DEFAULT_AUDIENCE", "local-api"),
    clientId: mustGet("OIDC_CLIENT_ID", "local-client"),
    clientSecret: mustGet("OIDC_CLIENT_SECRET", "local-secret"),
    redirectUri: mustGet("OIDC_REDIRECT_URI", "http://127.0.0.1:3000/callback")
  };
}
