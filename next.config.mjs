/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Build enxuto para Docker (gera .next/standalone com server.js). */
  output: "standalone",
  images: {
    unoptimized: true,
  },
  /** Server Actions: limite do body para actions */
  experimental: {
    serverActions: {
      bodySizeLimit: 20 * 1024 * 1024,
    },
  },
  async headers() {
    // Cabeçalhos de segurança aplicados a todas as respostas.
    const csp = [
      "default-src 'self'",
      // Next injeta scripts inline de bootstrap; 'unsafe-inline' é necessário sem nonce.
      // (Pós-MVP: migrar para CSP por nonce no middleware para remover 'unsafe-inline'.)
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ]
  },
}

export default nextConfig
