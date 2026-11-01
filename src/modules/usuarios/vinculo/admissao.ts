/**
 * Data de admissão × início do vínculo — PURO (sem I/O).
 *
 * `User.dataAdmissao` (ficha, férias) e `Vinculo.dataInicio` (ponto, folha, rateio) são campos
 * separados. Para quem só teve UM vínculo eles são a mesma data, e corrigir a admissão na ficha
 * precisa corrigir o vínculo junto — senão o ponto segue apurando pela data velha (dias trabalhados
 * antes do "início" contam inteiros como extra; dias depois da admissão real ficam sem jornada).
 *
 * Com dois ou mais vínculos (estágio → CLT, recontratação) a admissão não diz qual vínculo mudou:
 * nada é alterado, e a resposta explica por quê.
 */

export type VinculoParaAdmissao = { id: string; dataInicio: Date; dataFim: Date | null };

export type InicioDoVinculo =
  | { acao: "nenhuma" }
  | { acao: "alterar"; vinculoId: string; dataInicio: Date }
  | { acao: "recusar"; motivo: string };

export const MOTIVO_ADMISSAO_DEPOIS_DO_FIM =
  "A admissão não pode ser depois do fim do vínculo. Ajuste o desligamento antes.";

export function inicioDoVinculoPelaAdmissao(
  vinculos: VinculoParaAdmissao[],
  admissao: Date | null,
): InicioDoVinculo {
  if (!admissao || vinculos.length !== 1) return { acao: "nenhuma" };
  const [v] = vinculos;
  if (v.dataInicio.getTime() === admissao.getTime()) return { acao: "nenhuma" };
  if (v.dataFim && admissao > v.dataFim) return { acao: "recusar", motivo: MOTIVO_ADMISSAO_DEPOIS_DO_FIM };
  return { acao: "alterar", vinculoId: v.id, dataInicio: admissao };
}
