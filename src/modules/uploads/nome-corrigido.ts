import { montarNome } from "@/modules/uploads/nomenclatura/padrao";

/**
 * Sem `revisao`: quem versiona é o HUB (Upload.versao/DocumentoRevisao), não mais o `-Rnn`
 * no nome do arquivo (convenção mudou em 2026-09-16) — o nome corrigido nunca deve sugerir
 * ao projetista que digite uma revisão.
 *
 * `padrao` e `larguraNumero` são os da versão do projeto (`resolverNomenclatura`); sem eles, o
 * formato original (v1, 4 dígitos). `siglaDisciplina` é o que ocupa o lugar da disciplina no
 * nome: a sigla da sub-disciplina quando houver, senão a geral do card — e as siglas de fase e
 * tipo já vêm na escrita DA VERSÃO (BAS na v2, BS na v1).
 */
export function nomeCorrigidoPeloPadrao(input: {
  nomeOriginal: string;
  codigoProjeto: string;
  siglaDisciplina: string;
  fase: string;
  tipo: string;
  numeracao: number;
  padrao?: string | null;
  larguraNumero?: number;
}): string {
  const ponto = input.nomeOriginal.lastIndexOf(".");
  const extensao = ponto > 0 ? input.nomeOriginal.slice(ponto) : "";
  return (
    montarNome(
      input.padrao,
      { proj: input.codigoProjeto, disc: input.siglaDisciplina, fase: input.fase, num: input.numeracao, tipo: input.tipo },
      { larguraNumero: input.larguraNumero ?? 4 },
    ) + extensao
  );
}
