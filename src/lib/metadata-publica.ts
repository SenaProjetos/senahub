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
 * A imagem (`/icons/icon-512.png`) precisa ser servida sem sessão — o crawler faz uma segunda
 * requisição, sem cookie. Por isso `icons` está fora do matcher em `middleware.ts`.
 */
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
      images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "SenaHub" }],
    },
  };
}
