/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // linting runs once for the whole monorepo (`pnpm lint`, eslint.config.mjs at the root, gated in CI)
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@tradingworld/shared", "@tradingworld/analysis-engine"],
  output: "standalone",
  experimental: { optimizePackageImports: ["lightweight-charts"] },
};
export default nextConfig;
