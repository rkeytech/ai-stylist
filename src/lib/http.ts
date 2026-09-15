import { NextResponse } from "next/server";
import { AiError } from "./ai";
import { MAX_UPLOAD_BYTES, sniffImageMime, type ImageMime } from "./image-mime";
import { getSessionUser, type SessionUser } from "./session";

export class HttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Wraps a route handler so thrown HttpError/AiError become JSON `{ error }` responses. */
export function handle<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError || err instanceof AiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error("[api] Unexpected error:", err);
      return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
    }
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError("Please sign in to continue.", 401);
  return user;
}

/** Blocks cross-site state-changing requests (defence in depth on top of SameSite=Lax cookies). */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host")].filter(Boolean);
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  if (!originHost || !hosts.includes(originHost)) {
    throw new HttpError("Cross-site request blocked.", 403);
  }
}

export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError("Expected a JSON body.", 400);
}

export async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new HttpError("Expected a form upload.", 400);
  }
}

export async function readImageFile(value: FormDataEntryValue | null): Promise<{ bytes: Uint8Array; mime: ImageMime }> {
  if (!(value instanceof File) || value.size === 0) throw new HttpError("Please choose a photo.", 400);
  if (value.size > MAX_UPLOAD_BYTES) throw new HttpError("That photo is too large (10 MB max).", 413);
  const bytes = new Uint8Array(await value.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) throw new HttpError("Please upload a JPEG, PNG or WebP image.", 415);
  return { bytes, mime };
}

export function readCredentials(body: Record<string, unknown>, mode: "login" | "signup") {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError("Please enter a valid email address.", 400);
  }
  if (password.length > 200) throw new HttpError("That password is too long.", 400);
  if (mode === "signup" && password.length < 8) {
    throw new HttpError("Your password needs at least 8 characters.", 400);
  }
  if (!password) throw new HttpError("Please enter your password.", 400);
  return { email, password };
}
