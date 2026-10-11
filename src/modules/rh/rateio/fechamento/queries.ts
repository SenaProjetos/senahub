import "server-only";

import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { calcularRateioDoMes, corteCalculoNovo } from "@/modules/rh/rateio/queries";
import { mesTerminou } from "@/modules/rh/rateio/custo-hora/distribuicao";
import { agruparLinhasDoMes, type LinhaParaDetalhe } from "./detalhe";
import { mesesDaTela } from "./meses";
import { divergencia } from "./regras";

export type MesDoRateio = {
  ano: number;
  mes: number;
  emCurso: boolean;
  mesTerminou: boolean;
  fechado: boolean;
  calculo: "legado" | "v2" | null;
  fechadoEm: string | null;
  fechadoPor: string | null;
  /** Horas marcadas no mês: as congeladas se fechado, a estimativa ao vivo se aberto. */
  minutos: number;
  /** `null` para quem não vê custo. Fechado = custo congelado; aberto = estimativa ao vivo. */
  custoCent: number | null;
  /** Só mês fechado: o ponto de hoje dá outro resultado para o mesmo mês? Reais só com permissão de custo. */
  divergencia: { alterado: boolean; diferencaMin: number; diferencaCent: number | null } | null;
};

const chaveDe = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;

/**
 * Situação de cada mês da tela do rateio (R3.5). Mês fechado: horas e custo vêm do que foi congelado,
 * e o cálculo ao vivo só serve para a divergência ("alterado depois do fechamento"). Mês aberto:
 * estimativa ao vivo. O custo em reais sai daqui já nulo para quem não pode vê-lo (decisão 26).
 */
export async function situacaoDosMeses(p: { podeVerCusto: boolean; agora?: Date }): Promise<MesDoRateio[]> {
  const agora = p.agora ?? new Date();
  const [corte, fechamentos, congeladas] = await Promise.all([
    corteCalculoNovo(),
    prisma.fechamentoRateio.findMany({
      select: { ano: true, mes: true, calculo: true, custoTotal: true, fechadoEm: true, fechadoPor: { select: { name: true } } },
    }),
    prisma.rateioHora.groupBy({ by: ["ano", "mes"], _sum: { minutos: true } }),
  ]);
  const porMes = new Map(fechamentos.map((f) => [chaveDe(f.ano, f.mes), f]));
  const minutosCongelados = new Map(congeladas.map((g) => [chaveDe(g.ano, g.mes), g._sum.minutos ?? 0]));
  const meses = mesesDaTela({ corte, hojeSP: diaDeSaoPaulo(agora), fechados: fechamentos.map((f) => chaveDe(f.ano, f.mes)) });

  const out: MesDoRateio[] = [];
  // Em série: cada mês refaz o custo de todo mundo, e a página não precisa de pressa que sature o banco.
  for (const m of meses) {
    const f = porMes.get(m.chave);
    const vivo = await calcularRateioDoMes(m.ano, m.mes);
    const vivoMin = vivo.linhas.reduce((s, l) => s + l.minutos, 0);
    const vivoCent = vivo.linhas.reduce((s, l) => s + l.custoCent, 0);
    const congeladoCent = f ? Math.round(Number(f.custoTotal) * 100) : 0;
    const congeladoMin = f ? (minutosCongelados.get(m.chave) ?? 0) : 0;
    let div: MesDoRateio["divergencia"] = null;
    if (f) {
      const d = divergencia(congeladoCent, vivoCent);
      const diferencaMin = vivoMin - congeladoMin;
      // Mês fechado no cálculo antigo: o custo refeito hoje depende do cadastro de salários de hoje, não
      // do ponto — compará-lo avisaria "alterado" em todo mês antigo. Só as horas contam como alteração.
      const legado = f.calculo === "legado";
      div = {
        alterado: legado ? diferencaMin !== 0 : d.alterado || diferencaMin !== 0,
        diferencaMin,
        diferencaCent: p.podeVerCusto && !legado ? d.diferencaCent : null,
      };
    }
    out.push({
      ano: m.ano,
      mes: m.mes,
      emCurso: m.emCurso,
      mesTerminou: mesTerminou(m.ano, m.mes, agora),
      fechado: !!f,
      calculo: f ? (f.calculo === "legado" ? "legado" : "v2") : null,
      fechadoEm: f?.fechadoEm.toISOString() ?? null,
      fechadoPor: f?.fechadoPor?.name ?? null,
      minutos: f ? congeladoMin : vivoMin,
      custoCent: p.podeVerCusto ? (f ? congeladoCent : vivoCent) : null,
      divergencia: div,
    });
  }
  return out;
}

export type GrupoDoDetalhe = {
  projeto: string | null;
  disciplina: string | null;
  natureza: "projeto" | "reuniao" | "nao_alocado";
  minutos: number;
  custoCent: number | null;
};

export type EventoDoRateio = {
  tipo: string;
  motivo: string | null;
  calculo: string | null;
  custoCent: number | null;
  autor: string | null;
  criadoEm: string;
};

export type DetalheDoMes = { ano: number; mes: number; fechado: boolean; grupos: GrupoDoDetalhe[]; eventos: EventoDoRateio[] };

/**
 * Detalhe de um mês: horas por projeto e disciplina (fechado = o que foi congelado; aberto = ao vivo)
 * e o histórico de fechar/reabrir/recalcular com motivo. Reais só para quem vê custo.
 */
export async function detalheDoMes(ano: number, mes: number, podeVerCusto: boolean): Promise<DetalheDoMes> {
  const fechamento = await prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } }, select: { id: true } });
  let linhas: LinhaParaDetalhe[];
  if (fechamento) {
    const rows = await prisma.rateioHora.findMany({
      where: { ano, mes },
      select: { projetoId: true, disciplinaId: true, natureza: true, minutos: true, custo: true },
    });
    linhas = rows.map((r) => ({
      projetoId: r.projetoId,
      disciplinaId: r.disciplinaId,
      natureza: r.natureza,
      minutos: r.minutos,
      custoCent: Math.round(Number(r.custo) * 100),
    }));
  } else {
    const vivo = await calcularRateioDoMes(ano, mes);
    linhas = vivo.linhas.map((l) => ({ projetoId: l.projetoId, disciplinaId: l.disciplinaId, natureza: l.natureza, minutos: l.minutos, custoCent: l.custoCent }));
  }
  const grupos = agruparLinhasDoMes(linhas);
  const idsProjeto = [...new Set(grupos.flatMap((g) => (g.projetoId ? [g.projetoId] : [])))];
  const idsDisciplina = [...new Set(grupos.flatMap((g) => (g.disciplinaId ? [g.disciplinaId] : [])))];
  const [projetos, disciplinas, eventos] = await Promise.all([
    prisma.projeto.findMany({ where: { id: { in: idsProjeto } }, select: { id: true, codigo: true, nome: true } }),
    prisma.disciplina.findMany({
      where: { id: { in: idsDisciplina } },
      select: { id: true, disciplinaTextoLegado: true, catalogo: { select: { nome: true } } },
    }),
    prisma.fechamentoRateioEvento.findMany({
      where: { ano, mes },
      orderBy: { criadoEm: "desc" },
      select: { tipo: true, motivo: true, calculo: true, custoTotal: true, criadoEm: true, autor: { select: { name: true } } },
    }),
  ]);
  const nomeProjeto = new Map(projetos.map((p) => [p.id, `${formatarCodigo(p.codigo)} · ${p.nome}`]));
  const nomeDisciplina = new Map(disciplinas.map((d) => [d.id, d.catalogo?.nome ?? d.disciplinaTextoLegado ?? "Disciplina"]));
  return {
    ano,
    mes,
    fechado: !!fechamento,
    grupos: grupos.map((g) => ({
      projeto: g.projetoId ? (nomeProjeto.get(g.projetoId) ?? g.projetoId) : null,
      disciplina: g.disciplinaId ? (nomeDisciplina.get(g.disciplinaId) ?? null) : null,
      natureza: g.natureza,
      minutos: g.minutos,
      custoCent: podeVerCusto ? g.custoCent : null,
    })),
    eventos: eventos.map((e) => ({
      tipo: e.tipo,
      motivo: e.motivo,
      calculo: e.calculo,
      custoCent: podeVerCusto && e.custoTotal != null ? Math.round(Number(e.custoTotal) * 100) : null,
      autor: e.autor?.name ?? null,
      criadoEm: e.criadoEm.toISOString(),
    })),
  };
}
