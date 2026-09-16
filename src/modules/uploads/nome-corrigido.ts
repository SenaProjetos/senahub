import { codigoPrancha } from "@/modules/projetos/pranchas/codigo";

/**
 * Sem `revisao`: quem versiona é o HUB (Upload.versao/DocumentoRevisao), não mais o `-Rnn`
 * no nome do arquivo (convenção mudou em 2026-09-16) — o nome corrigido nunca deve sugerir
 * ao projetista que digite uma revisão.
 */
export function nomeCorrigidoPeloPadrao(input: {
  nomeOriginal: string;
  codigoProjeto: string;
  siglaDisciplina: string;
  fase: string;
  tipo: string;
  numeracao: number;
}): string {
  const ponto = input.nomeOriginal.lastIndexOf(".");
  const extensao = ponto > 0 ? input.nomeOriginal.slice(ponto) : "";
  return codigoPrancha({
    projetoCodigo: input.codigoProjeto,
    siglaDisciplina: input.siglaDisciplina,
    fase: input.fase,
    tipo: input.tipo,
    numeracao: input.numeracao,
    revisao: 0,
  }) + extensao;
}
