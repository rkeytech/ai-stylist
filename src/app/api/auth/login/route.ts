import { NextResponse } from "next/server";
import { assertSameOrigin, handle, HttpError, isSecureRequest, readCredentials, readJson } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { findUserByEmail } from "@/lib/repo";
import { startSession } from "@/lib/session";

// Verifying against a throwaway hash when the email is unknown keeps response
// times similar, so the endpoint doesn't reveal which emails have accounts.
let decoyHash: Promise<string> | undefined;

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const { email, password } = readCredentials(await readJson(request), "login");
  const user = findUserByEmail(email);

  decoyHash ??= hashPassword("decoy-password-for-timing");
  const valid = await verifyPassword(password, user?.password_hash ?? (await decoyHash));
  if (!user || !valid) throw new HttpError("That email and password don't match an account.", 401);

  await startSession(user.id, isSecureRequest(request));
  return NextResponse.json({ user: { id: user.id, email: user.email } });
});
