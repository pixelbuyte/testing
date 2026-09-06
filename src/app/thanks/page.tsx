import Link from "next/link";
import { Card, Logo } from "@/components/ui";

export default function ThanksPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-5">
          <Link href="/">
            <Logo className="text-[15px]" />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-16">
        <Card className="max-w-md p-8 text-center">
          <h1 className="display text-[26px] font-semibold">You&apos;re all set.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Your payment details are updated and your subscription is active again. Nothing else to do — you can close this tab.
          </p>
        </Card>
      </main>
    </div>
  );
}
