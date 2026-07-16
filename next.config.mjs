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
  // No `images.remotePatterns` here on purpose: the app never loads a
  // remote image through next/image (the only <Image> usage is the local
  // /public/logo.svg — student/profile photos are inline base64 data URLs
  // rendered as plain <img>, not next/image). A wildcard `hostname: "**"`
  // was previously set here despite that, which would have let next/image's
  // server-side fetch/optimization endpoint be pointed at ANY external (or
  // internal-network) URL — an SSRF/proxy-abuse surface with no upside since
  // nothing actually uses it. If a real remote image host is ever needed,
  // add its exact hostname here rather than reintroducing a wildcard.
  async headers() {
    const csp = [
      "default-src 'self'",
      // 'unsafe-inline' is required for Next.js's own hydration bootstrap
      // and next-themes' anti-flash inline script; a nonce-based CSP would
      // remove the need for this but requires per-request middleware
      // plumbing — a reasonable future hardening step, not done here.
      "script-src 'self' 'unsafe-inline'",
      // Radix UI (Popover/Dialog/Tooltip/Dropdown) positions itself via
      // inline `style` attributes set directly by JS — style-src needs
      // 'unsafe-inline' too, or every dropdown/dialog silently breaks.
      "style-src 'self' 'unsafe-inline'",
      // Student/profile photos are stored as base64 `data:` URLs.
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
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
