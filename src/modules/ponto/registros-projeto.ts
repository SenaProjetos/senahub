import { diaLocal } from "@/modules/ponto/engine";

export type SessaoProjetoEquipe = {
  id: string;
  inicio: Date;
  fim: Date | null;
  user: { id: string; name: string; role: string };
};

export type RegistroProjetoEquipe = {
  id: string;
  colaborador: { id: string; nome: string };
  tipo: "jornada" | "apontamento";
  inicio: Date;
  fim: Date | null;
  minutos: number;
  emAndamento: boolean;
};

export type RegistrosDiariosProjeto = {
  dia: string;
  totalMinutos: number;
  registros: RegistroProjetoEquipe[];
};

function tipoRegistro(role: string): RegistroProjetoEquipe["tipo"] {
  return role === "projetista_pj" || role === "freelancer" ? "apontamento" : "jornada";
}

/**
 * Agrupa as sessões já filtradas de um projeto por dia local de Brasília. A
 * referência explícita torna os apontamentos em andamento determinísticos no
 * servidor e nos testes.
 */
export function agruparRegistrosDiariosProjeto(
  sessoes: SessaoProjetoEquipe[],
  agora: Date,
): RegistrosDiariosProjeto[] {
  const porDia = new Map<string, RegistrosDiariosProjeto>();

  for (const sessao of sessoes) {
    const fim = sessao.fim ?? agora;
    const minutos = Math.max(0, Math.round((fim.getTime() - sessao.inicio.getTime()) / 60_000));
    if (minutos === 0) continue;

    const dia = diaLocal(sessao.inicio);
    const grupo = porDia.get(dia) ?? { dia, totalMinutos: 0, registros: [] };
    grupo.totalMinutos += minutos;
    grupo.registros.push({
      id: sessao.id,
      colaborador: { id: sessao.user.id, nome: sessao.user.name },
      tipo: tipoRegistro(sessao.user.role),
      inicio: sessao.inicio,
      fim: sessao.fim,
      minutos,
      emAndamento: sessao.fim === null,
    });
    porDia.set(dia, grupo);
  }

  return [...porDia.values()]
    .sort((a, b) => b.dia.localeCompare(a.dia))
    .map((grupo) => ({
      ...grupo,
      registros: grupo.registros.sort((a, b) => b.inicio.getTime() - a.inicio.getTime()),
    }));
}
