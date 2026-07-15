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
    // though it's genuinely optional at runtime.
    // NOTE: `serverComponentsExternalPackages` only affects React Server
    // Component rendering, NOT Route Handlers (app/api/**/route.ts) — it
    // has no effect here. The actual fix for Route Handlers is the
    // `webpack()` override below.
    serverComponentsExternalPackages: ["pdfkit", "fontkit", "restructure"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // Force pdfkit to stay a real, unbundled `require("pdfkit")` in the
  // server output instead of being inlined into route.js. When webpack
  // bundles pdfkit, its `__dirname` at runtime resolves to the BUNDLED
  // file's location (e.g. .next/server/app/api/reports/teacher/), not to
  // pdfkit's real install path — so its `path.join(__dirname, "data",
  // "Helvetica.afm")` font lookup 404s (ENOENT) in production even though
  // it works locally. Externalizing it keeps `__dirname` pointing at the
  // real node_modules/pdfkit/js/ folder, where outputFileTracingIncludes
  // above has already ensured the actual data/*.afm files are deployed
  // alongside it.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [];
      externals.push("pdfkit");
      config.externals = externals;
    }
    return config;
  },
};

export default nextConfig;
