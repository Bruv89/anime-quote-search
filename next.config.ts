import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required so that better-sqlite3 (a native Node module) is not bundled
  // for the browser — it only runs in API routes / server components.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
