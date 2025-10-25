import createMDX from '@next/mdx'

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
})

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
  // 禁用telemetry
  experimental: {
    instrumentationHook: true,
  },
}

export default withMDX(nextConfig);
