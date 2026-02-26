/** @type {import('next').NextConfig} */
const nextConfig = {
  // All API routes need Node.js runtime (for SQLite + eventBus)
  // Edge runtime would lose access to the file system
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3']
  },

  // Never send ClawEye to the internet
  // It's a local-only tool running at localhost:7432
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // Allow SSE connections from the extension (localhost:18791)
          { key: 'Access-Control-Allow-Origin', value: 'http://localhost:18791' }
        ]
      }
    ];
  }
};

export default nextConfig;
