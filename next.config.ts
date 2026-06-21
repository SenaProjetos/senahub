import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite acessar o dev server a partir de outros dispositivos da rede local
  // (ex.: celular em http://192.168.0.52:3000) sem o aviso de cross-origin do Next 15.5.
  allowedDevOrigins: ["192.168.0.52"],
};

export default nextConfig;
