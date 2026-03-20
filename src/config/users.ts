import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type TestUser = {
  username: string;
  sub: string;
  email?: string;
  realmRoles?: string[];
  clientRoles?: Record<string, string[]>;
  scopes: string[];
};

export async function loadUsersFromConfig(configPath = "users.json"): Promise<TestUser[]> {
  const fullPath = resolve(process.cwd(), configPath);
  const raw = await readFile(fullPath, "utf8");
  const parsed = JSON.parse(raw) as TestUser[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("users.json must contain a non-empty array of users");
  }

  return parsed;
}
