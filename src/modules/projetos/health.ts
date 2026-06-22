import type { StatusDisciplina } from "@/generated/prisma/client";

export type NivelSaude = "ok" | "atencao" | "critico";

type DiscInfo = { status: StatusDisciplina; prazo: Date | string | null };

/** Saúde do projeto para projetos `em_andamento`. Retorna `null` para outros status. */
export function saudeProjeto(
  disciplinas: DiscInfo[],
  prazoFinal: Date | null,
  situacao: string,
  agora: Date = new Date(),
): NivelSaude | null {
  if (situacao !== "em_andamento") return null;

  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  const projetoAtrasado =
    prazoFinal != null &&
    new Date(
      prazoFinal.getFullYear(),
      prazoFinal.getMonth(),
      prazoFinal.getDate(),
    ) < hoje;

  const projetoProximo =
    !projetoAtrasado &&
    prazoFinal != null &&
    (() => {
      const venc = new Date(
        prazoFinal.getFullYear(),
        prazoFinal.getMonth(),
        prazoFinal.getDate(),
      );
      return Math.floor((venc.getTime() - hoje.getTime()) / 86_400_000) <= 14;
    })();

  const total = disciplinas.length;
  const ativas = disciplinas.filter((d) => d.status !== "aprovado");
  const atrasadas = ativas.filter((d) => {
    if (!d.prazo) return false;
    const p = new Date(d.prazo);
    if (Number.isNaN(p.getTime())) return false;
    const venc = new Date(p.getFullYear(), p.getMonth(), p.getDate());
    return venc < hoje;
  }).length;

  const pctAtrasadas = total > 0 ? atrasadas / total : 0;

  if (projetoAtrasado || pctAtrasadas >= 0.5) return "critico";
  if (atrasadas > 0 || projetoProximo) return "atencao";
  return "ok";
}
