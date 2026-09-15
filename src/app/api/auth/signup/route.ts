import { NextResponse } from "next/server";
import { assertSameOrigin, handle, HttpError, isSecureRequest, readCredentials, readJson } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { createUser, findUserByEmail } from "@/lib/repo";
import { startSession } from "@/lib/session";

const DUPLICATE = "An account with this email already exists. Sign in instead.";

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const { email, password } = readCredentials(await readJson(request), "signup");
  if (findUserByEmail(email)) throw new HttpError(DUPLICATE, 409);

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = createUser(email, passwordHash);
  } catch {
    // Unique constraint hit by a concurrent sign-up with the same email.
    throw new HttpError(DUPLICATE, 409);
  }

  await startSession(user.id, isSecureRequest(request));
  return NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
});
