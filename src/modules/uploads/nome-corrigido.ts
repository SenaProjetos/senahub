import { codigoPrancha } from "@/modules/projetos/pranchas/codigo";

export function nomeCorrigidoPeloPadrao(input: {
  nomeOriginal: string;
  codigoProjeto: string;
  siglaDisciplina: string;
  fase: string;
  tipo: string;
  numeracao: number;
  revisao: number;
}): string {
  const ponto = input.nomeOriginal.lastIndexOf(".");
  const extensao = ponto > 0 ? input.nomeOriginal.slice(ponto) : "";
  return codigoPrancha({
    projetoCodigo: input.codigoProjeto,
    siglaDisciplina: input.siglaDisciplina,
    fase: input.fase,
    tipo: input.tipo,
    numeracao: input.numeracao,
    revisao: input.revisao,
  }) + extensao;
}
