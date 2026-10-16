import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { loginAttempts } from "@/lib/login-attempts";
import { verifyOwnerCredentials } from "@/lib/login";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  cookies: { sessionToken: { name: "gps-locator.session-token" } },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize(credentials) {
        return verifyOwnerCredentials(credentials, prisma.user, loginAttempts);
      },
    }),
  ],
  callbacks: {
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      return session;
    },
  },
});
