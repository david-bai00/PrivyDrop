import createMDX from '@next/mdx'
import createNextIntlPlugin from 'next-intl/plugin'

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
})

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  images: {
    // Disable optimization inside Docker to avoid container loopback fetch failures (502)
    unoptimized: process.env.NEXT_IMAGE_UNOPTIMIZED === 'true',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/vi/**',
      },
    ]
  },
  // Enable standalone output to run without dev deps on server
  output: 'standalone',
  async headers() {
    return [
      {
        // Next.js marks App Router HTML "private, no-store" by default, which
        // forces every crawler and every visitor into an origin round trip.
        // Measured on this deployment: origin TTFB is ~50ms, but visitors far
        // from the origin region paid 1-2s because nothing was cached at all.
        //
        // Safe to share-cache because the rendered HTML is identical for every
        // visitor of a given path: all per-user state lives in the URL query
        // string (room ids), in localStorage, or in the socket connection.
        // Cloudflare keys on the path, not the query string, so an invite link
        // still resolves to the same shell HTML.
        source: '/:lang(en|zh|ja|es|de|fr|ko)(/[^?]*)?',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/llms.txt',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, s-maxage=86400',
          },
        ],
      },
      {
        source: '/sitemap.xml',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, s-maxage=86400',
          },
        ],
      },
      {
        // Fingerprinted build output is immutable; never revalidate it.
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  // 禁用telemetry
  experimental: {
    instrumentationHook: true,
  },
}

export default withNextIntl(withMDX(nextConfig));
