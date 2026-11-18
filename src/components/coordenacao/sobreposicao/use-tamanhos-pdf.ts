"use client";

import { useEffect, useMemo, useState } from "react";
import type { TamanhoPagina } from "@/modules/coordenacao/sobreposicao/apontar";
import type { CamadaDaCena } from "@/modules/coordenacao/sobreposicao/queries";
import { tamanhoDaPagina } from "./render-pdf";

/**
 * Tamanho da página do PDF de cada camada que tem pino (para levar o pino ao mundo), por id da camada.
 * Camada em DWG também precisa: o pino fica no PDF dela.
 */
export function useTamanhosPdf(camadas: CamadaDaCena[]): Record<string, TamanhoPagina> {
  const pedidos = useMemo(
    () =>
      camadas
        .filter((c) => c.pdf && c.pinos.length > 0)
        .map((c) => ({ id: c.id, uploadId: c.pdf!.uploadId, pagina: c.pagina, chave: `${c.pdf!.uploadId}:${c.pagina}` })),
    [camadas],
  );
  const assinatura = pedidos.map((p) => p.chave).join("|");
  const [porChave, setPorChave] = useState<Record<string, TamanhoPagina>>({});

  useEffect(() => {
    let vivo = true;
    for (const p of pedidos) {
      if (porChave[p.chave]) continue;
      tamanhoDaPagina(p.uploadId, p.pagina).then(
        (t) => vivo && setPorChave((m) => ({ ...m, [p.chave]: t })),
        (erro) => console.error("[sobreposicao] falha ao ler o tamanho da página:", erro),
      );
    }
    return () => {
      vivo = false;
    };
    // Só a lista de páginas importa; o mapa já lido é consultado, não observado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);

  return useMemo(() => {
    const out: Record<string, TamanhoPagina> = {};
    for (const p of pedidos) if (porChave[p.chave]) out[p.id] = porChave[p.chave];
    return out;
  }, [pedidos, porChave]);
}
