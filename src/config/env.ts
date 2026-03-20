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
  defaultAudiences: string[];
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenTtlSeconds: number;
};

function parseAudiences(value: string): string[] {
  const audiences = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (audiences.length === 0) {
    throw new Error("OIDC_DEFAULT_AUDIENCE must contain at least one audience value");
  }
  return audiences;
}

function parsePositiveInt(name: string, fallback: string): number {
  const raw = mustGet(name, fallback);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? "4100"),
    issuer: mustGet("OIDC_ISSUER", "http://127.0.0.1:4100"),
    defaultAudiences: parseAudiences(mustGet("OIDC_DEFAULT_AUDIENCE", "local-api")),
    clientId: mustGet("OIDC_CLIENT_ID", "local-client"),
    clientSecret: mustGet("OIDC_CLIENT_SECRET", "local-secret"),
    redirectUri: mustGet("OIDC_REDIRECT_URI", "http://127.0.0.1:3000/callback"),
    tokenTtlSeconds: parsePositiveInt("OIDC_TOKEN_TTL_SECONDS", "315360000")
  };
}
