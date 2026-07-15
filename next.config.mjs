/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
    // pdfkit loads its built-in font metric (.afm) files via a dynamically
    // constructed path (path.join(__dirname, "data", name + ".afm")), which
    // Next's file tracer cannot follow statically. Without this, those files
    // are silently dropped from the Vercel serverless bundle and PDF export
    // fails at runtime in production (ENOENT) even though it works locally.
    outputFileTracingIncludes: {
      "/api/reports/**/*": ["./node_modules/pdfkit/**/*"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
