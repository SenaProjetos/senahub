import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { version as appVersion } from "./package.json";

// SHA curto do commit em build-time. Guardado em try/catch porque o deploy pode
// rodar a partir de uma cópia sem .git — nesse caso cai para string vazia.
function gitSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "";
  }
}

const securityHeaders = [
  // Impede MIME sniffing; essencial para prevenir XSS via upload.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Impede clickjacking (ERP não deve ser embeddable).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desabilita features de browser que o ERP não usa. Microfone fica liberado
  // para o próprio site (self) — usado no áudio do chat (MediaRecorder).
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Permite acessar o dev server a partir de outros dispositivos da rede local
  // (ex.: celular em http://192.168.0.52:3000) sem o aviso de cross-origin do Next 15.5.
  allowedDevOrigins: ["192.168.0.52"],
  // Versão + SHA injetados no bundle (client + server) em build-time. Fonte única:
  // package.json (bumpado por `npm run release` via commit-and-tag-version).
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_GIT_SHA: gitSha(),
  },
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
