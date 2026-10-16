import { loadEnvConfig } from "@next/env";
import type { TestContext } from "node:test";

export function useTestDatabase(t: TestContext) {
  loadEnvConfig(process.cwd());
  const target = process.env.TEST_DATABASE_URL;
  if (!target) { t.skip("set TEST_DATABASE_URL to a migrated disposable database"); return false; }
  const identity = (value: string) => {
    const url = new URL(value);
    return url.hostname.replace("-pooler.", ".") + url.pathname;
  };
  if (process.env.DATABASE_URL && identity(target) === identity(process.env.DATABASE_URL)) {
    throw new Error("TEST_DATABASE_URL must point to a separate disposable database");
  }
  process.env.DATABASE_URL = target;
  return true;
}
