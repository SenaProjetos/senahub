import "server-only";

import { prisma } from "@/lib/prisma";
import type { Dia } from "@/lib/calendario-trabalho";
import { diasEntre, segundaDaSemana } from "@/lib/dias-iso";
import type { CalendarioGantt } from "./gantt-escala";
import { montarCalendarioComNomes, paraDia, planoDoProjeto } from "./agenda";
import { corDoProjeto } from "./cor-projeto";
import { cargaDaEquipe } from "./recursos-queries";
import { ENCERRADA, ROTULO_PAPEL, type Papel, type StatusLinha } from "./recursos";
import { conflitosPorLinha, extremos, montarLinhasDoProjeto, type Periodo, type ProjetoGeral } from "./planejamento-geral";

export type PlanejamentoGeralDaTela = {
  periodo: Periodo;
  hoje: Dia;
  /** O calendário do motor (dias úteis e feriados): o Gantt sombreia o que não é dia útil. */
  calendario: CalendarioGantt;
  projetos: ProjetoGeral[];
};

/**
 * Tudo o que o Planejamento geral (`/planejamento/cronograma`) desenha (pool de recursos, parte 5). Os projetos são os da
 * carga de Recursos: com EAP, em andamento ou com cronograma aprovado, sem cancelado nem arquivado. As datas são as do
 * motor; o conflito vem das sobrecargas por dia de `cargaDaEquipe` (contando os rascunhos), no período.
 *
 * Cada projeto é agendado UMA vez: os planos vão para `cargaDaEquipe` pela opção `planos`.
 */
export async function planejamentoGeral(periodo: Periodo, hoje: Dia): Promise<PlanejamentoGeralDaTela> {
  const projetos = await prisma.projeto.findMany({
    where: {
      eapTarefas: { some: {} },
      situacao: { notIn: ["cancelado", "arquivado"] },
      OR: [{ situacao: "em_andamento" }, { cronograma: { aprovado: true } }],
    },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: { id: true, codigo: true, nome: true, cor: true, cronograma: { select: { aprovado: true, emRevisao: true } } },
  });
  const ids = projetos.map((p) => p.id);

  const [linhasDb, planos] = await Promise.all([
    prisma.eapTarefa.findMany({
      where: { projetoId: { in: ids } },
      select: {
        id: true,
        projetoId: true,
        parentId: true,
        ordem: true,
        nome: true,
        tipoEap: true,
        status: true,
        progresso: true,
        inicioPrevisto: true,
        fimPrevisto: true,
        disciplina: { select: { disciplinaTextoLegado: true, catalogo: { select: { nome: true } } } },
        atribuicoes: { select: { userId: true, papel: true, user: { select: { name: true } }, parceiro: { select: { nome: true } } } },
      },
    }),
    Promise.all(ids.map(async (id) => [id, await planoDoProjeto(id)] as const)),
  ]);
  const planoPorProjeto = new Map(planos);

  const carga = await cargaDaEquipe({
    semanas: Math.ceil((diasEntre(segundaDaSemana(periodo.de), periodo.ate) + 1) / 7),
    hoje: periodo.de,
    incluirDigitada: false,
    diario: { desde: periodo.de, comRascunhos: true },
    planos: planoPorProjeto,
  });
  const conflitos = conflitosPorLinha(carga.sobrecargasDiarias, periodo);

  const porProjeto = new Map<string, typeof linhasDb>();
  for (const l of linhasDb) porProjeto.set(l.projetoId, [...(porProjeto.get(l.projetoId) ?? []), l]);

  const { calendario } = await montarCalendarioComNomes([Number(periodo.de.slice(0, 4)) - 1, Number(periodo.ate.slice(0, 4)) + 1]);

  return {
    periodo,
    hoje,
    calendario: { diasUteis: [...calendario.diasSemana], feriados: [...calendario.feriados] },
    projetos: projetos.map((p) => {
      const agendadas = planoPorProjeto.get(p.id)?.resultado.linhas;
      const linhas = montarLinhasDoProjeto(
        (porProjeto.get(p.id) ?? []).map((l) => {
          const a = agendadas?.get(l.id);
          return {
            id: l.id,
            parentId: l.parentId,
            ordem: l.ordem,
            nome: l.nome,
            // Datas do MOTOR, como em todo cronograma: a gravada pode ter ficado para trás.
            inicio: a?.inicio ?? (l.inicioPrevisto ? paraDia(l.inicioPrevisto) : null),
            fim: a?.fim ?? (l.fimPrevisto ? paraDia(l.fimPrevisto) : null),
            marco: l.tipoEap === "mrc",
            encerrada: ENCERRADA.has(l.status as StatusLinha),
            progresso: Math.round(a?.progresso ?? Number(l.progresso ?? 0)),
            disciplina: l.disciplina?.catalogo?.nome ?? l.disciplina?.disciplinaTextoLegado ?? null,
            atribuicoes: l.atribuicoes.map((x) => ({
              userId: x.userId,
              nome: x.user?.name ?? null,
              papel: x.papel,
              rotuloPapel: ROTULO_PAPEL[x.papel as Papel] ?? x.papel,
              parceiro: x.parceiro?.nome ?? null,
            })),
          };
        }),
        conflitos,
      );
      return {
        id: p.id,
        codigo: p.codigo,
        nome: p.nome,
        cor: corDoProjeto(p),
        aprovado: p.cronograma?.aprovado ?? false,
        emRevisao: p.cronograma?.emRevisao ?? false,
        ...extremos(linhas.filter((l) => !l.temFilhos)),
        linhas,
      };
    }),
  };
}
