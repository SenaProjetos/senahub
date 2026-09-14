import type { Metadata } from "next";

/**
 * Metadados das páginas públicas por token (`/p/**`).
 *
 * O card de prévia do WhatsApp/Telegram/Slack sai daqui: o crawler busca a URL SEM sessão e lê
 * `<title>`, `description` e as tags `og:*`. Duas armadilhas motivam este helper:
 *
 * 1. `openGraph` NÃO é mesclado em profundidade pelo Next — um `openGraph` definido na página
 *    substitui o do layout raiz por inteiro. Sem centralizar, `images`/`siteName` sumiriam de
 *    toda página que definisse só o título.
 * 2. O texto é público. NUNCA colocar aqui nome de projeto, cliente ou documento: a prévia fica
 *    visível pra qualquer um em um grupo ou encaminhamento, antes de qualquer gate de token.
 *
 * A imagem precisa ser servida sem sessão — o crawler faz uma segunda requisição, sem cookie.
 * `MARCA` está fora do matcher em `middleware.ts`.
 */

/**
 * Imagem do card de prévia. PNG porque WhatsApp/Telegram/Facebook ignoram SVG em `og:image`.
 *
 * Gerada a partir de `public/MARCA/logo_hub_v_light.svg` (logo a 440px de altura, centralizado).
 * Fundo branco OPACO de propósito: o logo é azul-marinho e, com fundo transparente, some no
 * card escuro do WhatsApp em modo noturno. Para regerar após mudança da marca:
 *
 *   sharp(svg, { density: 600 }).resize({ height: 440 }) → composite num 600×600 #ffffff
 *   → flatten + removeAlpha → public/MARCA/og-image.png
 */
export const IMAGEM_PREVIA = {
  url: "/MARCA/og-image.png",
  width: 600,
  height: 600,
  alt: "SenaHub",
} as const;

export function metadataPublica({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao: string;
}): Metadata {
  return {
    title: titulo,
    description: descricao,
    robots: { index: false, follow: false },
    openGraph: {
      title: titulo,
      description: descricao,
      siteName: "SenaHub",
      locale: "pt_BR",
      type: "website",
      images: [IMAGEM_PREVIA],
    },
  };
}
