"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Tipo real é `OptionalContentConfig` de pdfjs-dist — não é publicamente exportado como tipo
// nomeado (só a classe, via `import * as pdfjs`), então tratamos como opaco aqui e deixamos o
// `any` restrito à borda com a lib (mesmo padrão de `PdfDoc` nos dois viewers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OcgConfig = any;

export type CamadaPdf = { id: string; nome: string; visivel: boolean };

/**
 * Camadas/OCG opcionais de um PDF (item 27) — a maioria dos PDFs não tem nenhuma (desenho
 * "achatado"); `temCamadas` fica `false` nesse caso e quem chama simplesmente não mostra UI.
 * API confirmada pública na `pdfjs-dist@6.1.200` instalada: `PDFDocumentProxy.
 * getOptionalContentConfig()` retorna a config; `config.setVisibility(id, bool)` alterna;
 * `page.render({ optionalContentConfigPromise })` é quem lê o estado no próximo render —
 * por isso `versao` existe: a config MUTA em memória (não é imutável), então precisa de um
 * contador externo pra forçar o React a re-render depois de um toggle.
 */
export function usePdfCamadas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
) {
  const configRef = useRef<OcgConfig | null>(null);
  const [grupos, setGrupos] = useState<CamadaPdf[]>([]);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let cancelado = false;
    configRef.current = null;
    setGrupos([]);
    if (!pdf) return;
    (async () => {
      try {
        const config = await pdf.getOptionalContentConfig();
        if (cancelado) return;
        configRef.current = config;
        // `[...config]` itera [id, OptionalContentGroup] — mais simples que reconstruir a
        // árvore de `getOrder()` (que pode aninhar pastas); lista achatada é suficiente aqui.
        const lista: CamadaPdf[] = [...config].map(([id, g]: [string, { name: string; visible: boolean }]) => ({
          id,
          nome: g.name || id,
          visivel: g.visible,
        }));
        setGrupos(lista);
      } catch (e) {
        console.debug("[use-pdf-camadas] falha ao ler OCG:", e);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pdf]);

  const alternar = useCallback((id: string) => {
    const config = configRef.current;
    if (!config) return;
    const atual = config.getGroup(id)?.visible ?? true;
    config.setVisibility(id, !atual);
    setGrupos((gs) => gs.map((g) => (g.id === id ? { ...g, visivel: !atual } : g)));
    setVersao((v) => v + 1);
  }, []);

  return {
    grupos,
    temCamadas: grupos.length > 0,
    alternar,
    /** Passar direto pra `PdfPagina` (`ocgConfig`). */
    config: configRef.current,
    versao,
  };
}
