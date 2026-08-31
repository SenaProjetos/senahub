import type { StatusDisciplina } from "@/generated/prisma/client";
import { inicioDoDia, inicioDoDiaLocal } from "@/lib/data";

export type NivelSaude = "ok" | "atencao" | "critico";

type DiscInfo = { status: StatusDisciplina; prazo: Date | string | null };

/**
 * Saúde do projeto para projetos `em_andamento`. Retorna `null` para outros status.
 *
 * Lê o prazo **planejado**: saúde é indicador interno da equipe. O prazo de
 * contrato é o compromisso com o cliente e manda nas telas externas.
 */
export function saudeProjeto(
  disciplinas: DiscInfo[],
  prazoPlanejado: Date | null,
  situacao: string,
  agora: Date = new Date(),
): NivelSaude | null {
  if (situacao !== "em_andamento") return null;

  // `inicioDoDia` normaliza a meia-noite UTC que o banco devolve — comparar com
  // `getDate()` direto adiantava o vencimento em um dia em America/Sao_Paulo.
  const hoje = inicioDoDiaLocal(agora);
  const vencProjeto = inicioDoDia(prazoPlanejado);

  const projetoAtrasado = vencProjeto != null && vencProjeto < hoje;

  const projetoProximo =
    !projetoAtrasado &&
    vencProjeto != null &&
    Math.floor((vencProjeto.getTime() - hoje.getTime()) / 86_400_000) <= 14;

  const total = disciplinas.length;
  const ativas = disciplinas.filter((d) => d.status !== "aprovado");
  const atrasadas = ativas.filter((d) => {
    const venc = inicioDoDia(d.prazo);
    return venc != null && venc < hoje;
  }).length;

  const pctAtrasadas = total > 0 ? atrasadas / total : 0;

  if (projetoAtrasado || pctAtrasadas >= 0.5) return "critico";
  if (atrasadas > 0 || projetoProximo) return "atencao";
  return "ok";
}
