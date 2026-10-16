import { hash } from "@node-rs/argon2";
import { z } from "zod";

export class SeedConfigurationError extends Error {}

export function readSeedSettings(env: { SEED_OWNER_EMAIL?: string; SEED_OWNER_PASSWORD?: string }) {
  const email = env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  if (!email || !z.email().safeParse(email).success) {
    throw new SeedConfigurationError("SEED_OWNER_EMAIL must be a valid email address");
  }

  const password = env.SEED_OWNER_PASSWORD;
  if (!password || password.length < 12 || !password.trim()) {
    throw new SeedConfigurationError("SEED_OWNER_PASSWORD must be at least 12 characters");
  }

  return { email, password };
}

type OwnerRepository = {
  findMany(args: { select: { email: true }; take: 2 }): Promise<{ email: string }[]>;
  create(args: { data: { id: string; email: string; passwordHash: string } }): Promise<unknown>;
};

export async function seedOwner(
  users: OwnerRepository,
  { email, password }: ReturnType<typeof readSeedSettings>,
) {
  const existing = await users.findMany({ select: { email: true }, take: 2 });
  if (existing.length) {
    if (existing.length !== 1 || existing[0].email !== email) {
      throw new SeedConfigurationError("A different owner already exists");
    }
    return "unchanged";
  }

  const passwordHash = await hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  try {
    await users.create({ data: { id: "owner", email, passwordHash } });
    return "created";
  } catch (error) {
    // A concurrent seed may have created the same owner while we hashed.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const current = await users.findMany({ select: { email: true }, take: 2 });
      if (current.length === 1 && current[0].email === email) return "unchanged";
      throw new SeedConfigurationError("A different owner already exists");
    }
    throw error;
  }
}
