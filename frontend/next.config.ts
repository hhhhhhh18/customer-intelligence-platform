import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // The browser only ever talks to /api on the Next origin; requests are
    // proxied to the Express API so no CORS handling is needed client-side.
    const target = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;
