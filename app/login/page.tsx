import { redirect } from "next/navigation";
import { getOwner } from "@/lib/owner";
import { LoginForm } from "./login-form";

export const instant = false;

export default async function LoginPage() {
  if (await getOwner()) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <section className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm" aria-labelledby="login-title">
        <p className="text-sm font-semibold tracking-wide text-primary">PRIVATE LOCATOR</p>
        <h1 id="login-title" className="mt-3 text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to see your things.</p>
        <LoginForm />
      </section>
    </main>
  );
}
