import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WebAssembly build of Postgres that must not be bundled by the
  // server compiler, and the Stripe SDK is happier left external too.
  serverExternalPackages: ["@electric-sql/pglite", "stripe"],
};

export default nextConfig;
