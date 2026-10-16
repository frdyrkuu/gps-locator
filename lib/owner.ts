import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { findSessionOwner } from "@/lib/session-owner";

// Call at the data boundary for every owner read/write, including future Route Handlers.
export const getOwner = cache(async () => {
  await connection();
  return findSessionOwner(await auth(), prisma.user);
});

export async function requireOwner() {
  const owner = await getOwner();
  if (!owner) redirect("/login");
  return owner;
}
