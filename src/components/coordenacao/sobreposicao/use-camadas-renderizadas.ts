"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CamadaDaCena } from "@/modules/coordenacao/sobreposicao/queries";
import type { CamadaRenderizada } from "./palco";
import { renderDwg } from "./render-dwg";
import { renderPdf } from "./render-pdf";

export type EstadoRender =
  | { tipo: "carregando" }
  | { tipo: "pronto"; render: CamadaRenderizada }
  | { tipo: "erro"; mensagem: string }
  /** Sem arquivo no formato, ou DWG ainda não convertido: o painel explica. */
  | { tipo: "indisponivel" };

type Pedido = { id: string; chave: string; carregar: () => Promise<CamadaRenderizada> };

/** `alinhando` = a camada está sendo alinhada: o PDF mostra a arquitetura de fundo (o DWG a traz à parte). */
function pedidoDa(c: CamadaDaCena, alinhando: boolean): Pedido | null {
  if (c.formato === "pdf") {
    if (!c.pdf) return null;
    const { uploadId } = c.pdf;
    const esconderArquitetura = !c.base && !alinhando;
    return {
      id: c.id,
      chave: `pdf:${uploadId}:${c.pagina}:${esconderArquitetura ? "sem-arq" : "com-arq"}`,
      carregar: () => renderPdf({ uploadId, pagina: c.pagina, esconderArquitetura, cor: c.cor }),
    };
  }
  if (!c.dwg || c.dwg.status !== "concluido") return null;
  const { desenhoId } = c.dwg;
  return {
    id: c.id,
    chave: `dwg:${desenhoId}:${c.base ? "base" : "camada"}`,
    carregar: () => renderDwg({ desenhoId, base: c.base }),
  };
}

const MENSAGEM_PDF = "Não foi possível abrir o PDF desta camada.";
const MENSAGEM_DWG = "Não foi possível abrir o desenho desta camada.";

/** Carrega (com cache) o desenho de cada camada; só recarrega a camada cujo arquivo, página, formato ou papel mudou. */
export function useCamadasRenderizadas(camadas: CamadaDaCena[], alinhandoId: string | null): Record<string, EstadoRender> {
  const pedidos = useMemo(
    () => camadas.map((c) => ({ id: c.id, pedido: pedidoDa(c, c.id === alinhandoId) })),
    [camadas, alinhandoId],
  );
  const assinatura = pedidos.map((p) => `${p.id}=${p.pedido?.chave ?? "-"}`).join("|");
  const [estados, setEstados] = useState<Record<string, { chave: string; estado: EstadoRender }>>({});
  const vigentes = useRef(new Map<string, string>());
  const pedidosRef = useRef(pedidos);
  useEffect(() => {
    pedidosRef.current = pedidos;
  });

  // A resposta só vale se a chave da camada ainda é a pedida (troca no meio do caminho descarta).
  useEffect(() => {
    const novos = new Map<string, string>();
    for (const { id, pedido } of pedidosRef.current) {
      const chave = pedido?.chave ?? "-";
      novos.set(id, chave);
      if (vigentes.current.get(id) === chave) continue;
      if (!pedido) {
        setEstados((e) => ({ ...e, [id]: { chave, estado: { tipo: "indisponivel" } } }));
        continue;
      }
      setEstados((e) => ({ ...e, [id]: { chave, estado: { tipo: "carregando" } } }));
      pedido.carregar().then(
        (render) => {
          if (vigentes.current.get(id) === chave) {
            setEstados((e) => ({ ...e, [id]: { chave, estado: { tipo: "pronto", render } } }));
          }
        },
        (erro) => {
          console.error("[sobreposicao] falha ao carregar camada:", erro);
          if (vigentes.current.get(id) === chave) {
            const mensagem = chave.startsWith("pdf:") ? MENSAGEM_PDF : MENSAGEM_DWG;
            setEstados((e) => ({ ...e, [id]: { chave, estado: { tipo: "erro", mensagem } } }));
          }
        },
      );
    }
    vigentes.current = novos;
  }, [assinatura]);

  return useMemo(() => {
    const out: Record<string, EstadoRender> = {};
    for (const { id, pedido } of pedidos) {
      const e = estados[id];
      out[id] = e && e.chave === (pedido?.chave ?? "-") ? e.estado : pedido ? { tipo: "carregando" } : { tipo: "indisponivel" };
    }
    return out;
  }, [pedidos, estados]);
}
