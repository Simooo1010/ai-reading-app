"use server";

// Sign-in server action (SPEC §8). The password is checked on the server
// only and is never sent back to the page.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, LOGIN_NEXT_HEADER, attemptLogin, sanitizeNextPath } from "@/lib/auth";

export type LoginState = { error: string | null };

const WRONG_PASSWORD = "That password is not right. Try again.";
const TOO_MANY_TRIES = "Too many tries. Wait a few minutes.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const result = await attemptLogin(formData.get("password"));
  if (!result.ok) {
    return { error: result.reason === "locked" ? TOO_MANY_TRIES : WRONG_PASSWORD };
  }
  (await cookies()).set(AUTH_COOKIE, result.token, result.cookie);
  // Where to go: the `next` query of /login, passed on by proxy.ts.
  redirect(sanitizeNextPath((await headers()).get(LOGIN_NEXT_HEADER)));
}
