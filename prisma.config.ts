import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generate and validate without DB credentials; migrate requires DIRECT_URL.
  datasource: { url: process.env.DIRECT_URL ?? "" },
});
