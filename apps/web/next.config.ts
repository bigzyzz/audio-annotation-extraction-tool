import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/shared-types ships raw TS source (no build step) — Next only
  // transpiles app code by default, so workspace deps need to be opted in.
  transpilePackages: ["@audio-tool/shared-types"],
};

export default nextConfig;
