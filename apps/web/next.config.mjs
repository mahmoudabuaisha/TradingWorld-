/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@tradingworld/shared", "@tradingworld/analysis-engine"],
  output: "standalone",
  experimental: { optimizePackageImports: ["lightweight-charts"] },
};
export default nextConfig;
