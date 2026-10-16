import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { useTestDatabase } from "./integration/database";

test("database lifecycle tests refuse the application's database, including its direct URL", () => {
  const application = process.env.DATABASE_URL;
  const target = process.env.TEST_DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgresql://owner:example@ep-test-pooler.neon.tech/application";
    process.env.TEST_DATABASE_URL = "postgresql://other:example@ep-test.neon.tech/application";
    assert.throws(() => useTestDatabase({} as TestContext), /separate disposable database/);
  } finally {
    if (application === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = application;
    if (target === undefined) delete process.env.TEST_DATABASE_URL; else process.env.TEST_DATABASE_URL = target;
  }
});
