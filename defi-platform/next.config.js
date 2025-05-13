/** @type {import('next').NextConfig} */
const nextConfig = {
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

// Removed Sentry configuration below this line 