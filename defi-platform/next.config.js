/** @type {import('next').NextConfig} */
const nextConfig = {
  // Essential for PostHog and development
  eslint: {
    // We recommend removing this setting in production to catch errors during build.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // We recommend removing this setting in production to catch errors during build.
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "walletconnect.com",
      }
    ],
  },
  // PostHog trailing slash support
  skipTrailingSlashRedirect: true,
  // PostHog ingestion rewrites
  async rewrites() {
    return [];
  },
  // Add security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-site',
          },
        ],
      },
    ];
  },
  // Add webpack externals for AppKit compatibility
  webpack: (config, { isServer }) => {
    // Fixes npm packages that depend on `fs` module
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
      };
    }
    // Required by WalletConnect
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

// Export the original config directly without the Sentry wrapper
module.exports = nextConfig; 