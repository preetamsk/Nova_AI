import type { NextConfig } from "next";

const backendUrl = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_URL ||
  "http://127.0.0.1:8001"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/:path*` }];
  },
};

export default nextConfig;
