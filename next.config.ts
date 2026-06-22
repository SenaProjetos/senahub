import type { NextConfig } from "next";

const securityHeaders = [
  // Impede MIME sniffing; essencial para prevenir XSS via upload.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Impede clickjacking (ERP não deve ser embeddable).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desabilita features de browser que o ERP não usa.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Permite acessar o dev server a partir de outros dispositivos da rede local
  // (ex.: celular em http://192.168.0.52:3000) sem o aviso de cross-origin do Next 15.5.
  allowedDevOrigins: ["192.168.0.52"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
