import { createHash } from "node:crypto";
import { verify } from "@node-rs/argon2";
import { z } from "zod";

const input = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
});

type Users = {
  findUnique(args: { where: { email: string }; select: { id: true; passwordHash: true } }):
    Promise<{ id: string; passwordHash: string } | null>;
};

type Attempts = {
  charge(key: string): Promise<boolean>;
  clear(key: string): Promise<void>;
};

export async function verifyOwnerCredentials(
  credentials: Partial<Record<"email" | "password", unknown>> | undefined,
  users: Users,
  attempts: Attempts,
) {
  const parsed = input.safeParse({
    email: typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : undefined,
    password: credentials?.password,
  });
  if (!parsed.success) return null;

  const { email, password } = parsed.data;
  const key = createHash("sha256").update(email).digest("hex");
  if (!(await attempts.charge(key))) return null;

  const owner = await users.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  if (!owner || !(await verify(owner.passwordHash, password))) return null;
  await attempts.clear(key);
  return { id: owner.id };
}
