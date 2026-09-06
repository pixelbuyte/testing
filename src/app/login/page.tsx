import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/app");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-5">
          <Link href="/">
            <Logo className="text-[15px]" />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <h1 className="display text-[28px] font-semibold">Sign in</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
            No password. We email you a six-digit code, and your account is created the first time you use one.
          </p>
          <div className="mt-7">
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}
