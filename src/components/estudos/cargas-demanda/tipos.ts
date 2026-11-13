import type { ConteudoCargasDemanda } from "@/modules/estudos/cargas-demanda/conteudo";

export type Etapa = 1 | 2 | 3;

/** Edição do documento: função pura sobre o conteúdo (o editor guarda o estado e o nome). */
export type Atualizar = (f: (c: ConteudoCargasDemanda) => ConteudoCargasDemanda) => void;

/** Props comuns das etapas. */
export type PropsEtapa = {
  conteudo: ConteudoCargasDemanda;
  atualizar: Atualizar;
  podeEditar: boolean;
};
