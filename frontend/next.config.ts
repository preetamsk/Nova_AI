import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  async rewrites() {
    if (process.env.BACKEND_URL) {
      return [{ source: "/api/:path*", destination: `${process.env.BACKEND_URL.replace(/\/$/, "")}/:path*` }];
    }
    return [];
  },
};

export default nextConfig;
