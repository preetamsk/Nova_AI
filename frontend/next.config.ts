import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  async rewrites() {
    // The browser talks to NOVA on its own origin. Ollama remains reachable
    // only by FastAPI on 127.0.0.1 and is never exposed to the browser.
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:8001/:path*" }];
  },
};

export default nextConfig;
