import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

// Observability tooling must never fail a production build: only enable the
// Sentry plugin when fully configured, and treat any upload error as non-fatal.
const isConfigured = (v: string | undefined) => Boolean(v && v !== 'placeholder');
const sentryEnabled =
  isConfigured(process.env.SENTRY_AUTH_TOKEN) &&
  isConfigured(process.env.SENTRY_ORG) &&
  isConfigured(process.env.SENTRY_PROJECT);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
      automaticVercelMonitors: true,
      unstable_sentryWebpackPluginOptions: {
        errorHandler: (err: Error) => {
          console.warn(`[sentry] non-fatal build plugin error: ${err.message}`);
        },
      },
    })
  : nextConfig;
