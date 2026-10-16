import assert from "node:assert/strict";
import { test } from "node:test";
import { verify } from "@node-rs/argon2";
import { readSeedSettings, seedOwner } from "../lib/seed-owner";

const originalPassword = "a-long-test-password";

function memoryUsers() {
  const rows: { id: string; email: string; passwordHash: string }[] = [];
  return {
    rows,
    async findMany() {
      return rows.slice(0, 2);
    },
    async create({ data }: { data: (typeof rows)[number] }) {
      if (rows.some((row) => row.id === data.id || row.email === data.email)) {
        throw { code: "P2002" };
      }
      rows.push(data);
    },
  };
}

test("seed requires valid environment values without exposing a password", () => {
  assert.throws(() => readSeedSettings({}), /SEED_OWNER_EMAIL/);
  assert.throws(() => readSeedSettings({ SEED_OWNER_EMAIL: "owner@example.com" }), /SEED_OWNER_PASSWORD/);
  assert.throws(
    () => readSeedSettings({ SEED_OWNER_EMAIL: "owner@example.com", SEED_OWNER_PASSWORD: "short" }),
    /SEED_OWNER_PASSWORD/,
  );
  assert.deepEqual(
    readSeedSettings({ SEED_OWNER_EMAIL: " Owner@Example.COM ", SEED_OWNER_PASSWORD: originalPassword }),
    { email: "owner@example.com", password: originalPassword },
  );
});

test("seed creates one Argon2id owner and repeat never resets its password", async () => {
  const users = memoryUsers();
  const settings = readSeedSettings({ SEED_OWNER_EMAIL: "Owner@Example.com", SEED_OWNER_PASSWORD: originalPassword });
  assert.equal(await seedOwner(users, settings), "created");
  assert.equal(users.rows[0].id, "owner");
  assert.match(users.rows[0].passwordHash, /^\$argon2id\$/);
  assert.equal(await verify(users.rows[0].passwordHash, originalPassword), true);

  const storedHash = users.rows[0].passwordHash;
  assert.equal(await seedOwner(users, { ...settings, password: "a-different-test-password" }), "unchanged");
  assert.equal(users.rows.length, 1);
  assert.equal(users.rows[0].passwordHash, storedHash);
});

test("different owner is rejected, including when a competing seed wins", async () => {
  const users = memoryUsers();
  const first = readSeedSettings({ SEED_OWNER_EMAIL: "first@example.com", SEED_OWNER_PASSWORD: originalPassword });
  const second = readSeedSettings({ SEED_OWNER_EMAIL: "second@example.com", SEED_OWNER_PASSWORD: originalPassword });
  await seedOwner(users, first);
  await assert.rejects(seedOwner(users, second), /different owner/);

  const raced = memoryUsers();
  raced.create = async () => {
    raced.rows.push({ id: "owner", email: first.email, passwordHash: "preexisting-hash" });
    throw { code: "P2002" };
  };
  await assert.rejects(seedOwner(raced, second), /different owner/);
  assert.equal(raced.rows[0].email, first.email);
});

test("a concurrent seed of the same email is still idempotent", async () => {
  const users = memoryUsers();
  const settings = readSeedSettings({ SEED_OWNER_EMAIL: "owner@example.com", SEED_OWNER_PASSWORD: originalPassword });
  users.create = async () => {
    users.rows.push({ id: "owner", email: settings.email, passwordHash: "existing-hash" });
    throw { code: "P2002" };
  };
  assert.equal(await seedOwner(users, settings), "unchanged");
  assert.equal(users.rows[0].passwordHash, "existing-hash");
});
