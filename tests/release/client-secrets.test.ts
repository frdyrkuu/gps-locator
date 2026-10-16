import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { loadEnvConfig } from "@next/env";

test("production client assets contain no configured server secret literals", async (t) => {
  loadEnvConfig(process.cwd());
  const secrets = ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "SEED_OWNER_PASSWORD", "CRON_SECRET"]
    .map(name => [name, process.env[name]] as const).filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  assert.ok(secrets.length > 0, "Configure server environment values before checking client assets");
  const root = join(process.cwd(), ".next", "static");
  async function scan(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { await scan(path); continue; }
      if (!/\.(?:js|mjs|map|css|json)$/.test(entry.name)) continue;
      const content = await readFile(path, "utf8");
      for (const [name, value] of secrets) {
        assert.equal(content.includes(value) || content.includes(JSON.stringify(value).slice(1, -1)), false,
          `${name} appears in client asset ${relative(root, path)}`);
      }
    }
  }
  await scan(root);
  t.diagnostic(`Checked ${secrets.length} configured server values; absent environment values are not covered.`);
});
