import assert from "node:assert/strict";
import { test } from "node:test";
import { hash } from "@node-rs/argon2";
import { verifyOwnerCredentials } from "../lib/login";
import { findSessionOwner } from "../lib/session-owner";

test("credentials accept only the seeded owner's password and normalize email", async () => {
  const passwordHash = await hash("correct-owner-password");
  const keys: string[] = [];
  const users = {
    async findUnique({ where }: { where: { email: string } }) {
      return where.email === "owner@example.com" ? { id: "owner", passwordHash } : null;
    },
  };
  const attempts = {
    async charge(key: string) { keys.push(key); return true; },
    async clear(key: string) { keys.push(`cleared:${key}`); },
  };
  assert.equal(await verifyOwnerCredentials({ email: "other@example.com", password: "correct-owner-password" }, users, attempts), null);
  assert.equal(await verifyOwnerCredentials({ email: "owner@example.com", password: "wrong" }, users, attempts), null);
  assert.deepEqual(await verifyOwnerCredentials({ email: " Owner@Example.COM ", password: "correct-owner-password" }, users, attempts), { id: "owner" });
  assert.equal(keys[1], keys[2]);
  assert.equal(keys[2].length, 64);
  assert.equal(keys.filter((key) => key.startsWith("cleared:")).length, 1);
  assert.equal(await verifyOwnerCredentials({ email: "bad", password: "x" }, users, attempts), null);
  assert.equal(keys.length, 4);
});

test("blocked attempts never query the password hash", async () => {
  const users = { async findUnique() { throw new Error("must not query"); } };
  const attempts = { async charge() { return false; }, async clear() { throw new Error("must not clear"); } };
  assert.equal(await verifyOwnerCredentials({ email: "owner@example.com", password: "wrong" }, users, attempts), null);
});

test("missing and deleted session owners cannot reach owned data", async () => {
  const ids: string[] = [];
  const users = {
    async findUnique({ where }: { where: { id: string } }) {
      ids.push(where.id);
      return where.id === "owner" ? { id: "owner", email: "owner@example.com" } : null;
    },
  };
  assert.equal(await findSessionOwner(null, users), null);
  assert.equal(await findSessionOwner({ user: {} }, users), null);
  assert.equal(await findSessionOwner({ user: { id: "deleted" } }, users), null);
  assert.deepEqual(await findSessionOwner({ user: { id: "owner" } }, users), { id: "owner", email: "owner@example.com" });
  assert.deepEqual(ids, ["deleted", "owner"]);
});
