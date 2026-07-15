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
      "/api/reports/**/*": ["./node_modules/pdfkit/**/*", "./node_modules/fontkit/**/*"],
    },
    // pdfkit pulls in fontkit -> restructure, which does a try/catch
    // `require("iconv-lite")` for optional non-UTF8 font string encoding
    // that this app never uses. Webpack still tries to statically resolve
    // that require at BUILD time and fails with "Module not found" even
    // though it's genuinely optional at runtime. Marking these packages as
    // external makes Next `require()` them for real at request time via
    // Node's own resolver (which correctly honors the try/catch and just
    // leaves the optional dependency undefined), instead of bundling them.
    serverComponentsExternalPackages: ["pdfkit", "fontkit", "restructure"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
