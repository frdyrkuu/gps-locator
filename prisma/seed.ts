import { loadEnvConfig } from "@next/env";
import { readSeedSettings, seedOwner, SeedConfigurationError } from "../lib/seed-owner";

async function main() {
  loadEnvConfig(process.cwd());
  const settings = readSeedSettings({
    SEED_OWNER_EMAIL: process.env.SEED_OWNER_EMAIL,
    SEED_OWNER_PASSWORD: process.env.SEED_OWNER_PASSWORD,
  });
  const { prisma } = await import("../lib/db");
  try {
    const result = await seedOwner(prisma.user, settings);
    console.log(result === "created" ? "Owner created" : "Owner already exists");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof SeedConfigurationError
      ? error.message
      : "Owner seed failed; check DATABASE_URL and that migrations have been applied",
  );
  process.exitCode = 1;
});
