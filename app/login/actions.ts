"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function login(_state: string, formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") {
      return "Invalid email or password, or too many attempts. Try again later.";
    }
    throw error;
  }
  return "";
}
