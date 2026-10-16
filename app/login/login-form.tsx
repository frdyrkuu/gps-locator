"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, "");

  return (
    <form action={action} className="mt-8 space-y-5">
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium">Email</label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium">Password</label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
