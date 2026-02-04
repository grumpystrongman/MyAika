/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const target = process.env.AIKA_SERVER_URL || "http://127.0.0.1:8790";
    return [
      { source: "/chat", destination: `${target}/chat` },
      { source: "/api/:path*", destination: `${target}/api/:path*` }
    ];
  },
  webpack: (config, { dev }) => {
    // OneDrive/Windows can intermittently corrupt webpack pack cache in dev.
    // Disable filesystem cache to avoid repeated restore warnings and retries.
    if (dev) {
      config.cache = false;
    }
    return config;
  }
};

export default nextConfig;
