import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ['bcryptjs', '@react-pdf/renderer', '@prisma/client', '@prisma/adapter-neon', '@neondatabase/serverless'],
  compress: true,
  poweredByHeader: false,
};
export default nextConfig;
