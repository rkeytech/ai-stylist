import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage() {
  if (await getSessionUser()) redirect("/wardrobe");
  return <AuthForm mode="signup" />;
}
