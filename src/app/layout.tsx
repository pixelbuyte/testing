import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "PastDue — Stripe retries the card. Nobody retries the customer.",
  description:
    "Connect Stripe and see every subscription that failed, expired, or was cancelled by a dead card — then let PastDue chase each one in your voice until the money comes back.",
  openGraph: {
    title: "PastDue — win back the customers Stripe already gave up on",
    description: "Find the failed payments Stripe stopped retrying, and recover them automatically.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} antialiased`}>{children}</body>
    </html>
  );
}
