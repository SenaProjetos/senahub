/**
 * Versão do sistema, injetada em build-time via next.config.ts (`env`).
 * Fonte única = package.json `version` (bumpado por `npm run release`).
 * Seguro em client e server: os valores são inlined pelo bundler.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const GIT_SHA = process.env.NEXT_PUBLIC_GIT_SHA ?? "";

/** Ex.: "v1.0.0 (a1b2c3d)" ou "v1.0.0" quando não há SHA disponível. */
export const VERSION_LABEL = GIT_SHA ? `v${APP_VERSION} (${GIT_SHA})` : `v${APP_VERSION}`;
