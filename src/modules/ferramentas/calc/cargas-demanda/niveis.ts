/**
 * Centros de medição (CMD) e entrada geral (CPG) — **puro**. Spec §3.1 (etapa 3) e §5 passos 17 e 18:
 *   CMD = apartamentos DO CMD pela área útil, com a quantidade do CMD (fatores refeitos para ela), + os cálculos de
 *         carga instalada dos medidores que estão nele;
 *   CPG = apartamentos de TODOS os CMDs pela área útil, com o total de apartamentos do prédio, + condomínio, incêndio e
 *         cargas especiais. Não é a soma das demandas dos CMDs.
 * Cada nível tem os seus ajustes (regra 5): mudar um fator no CPG não muda os CMDs. Um flat individual só entra se o
 * projetista o incluir (regra 6) — aqui, só entra o que está nos medidores ou em `calculosSoNoCpg`.
 */

import { avisosDeAtendimento, type Atendimento, type UsoDaEdificacao } from "./atendimento";
import type { Sistema } from "./corrente";
import {
  demandaDoNivel,
  type AjustesDoNivel,
  type CalculoNoNivel,
  type IdConcessionaria,
  type OpcoesDoNivel,
  type ResultadoDoNivel,
  type TipoNoNivel,
} from "./composicao";
import { MSG, type Mensagem } from "./mensagens";

/** Um medidor do CMD: residencial (tipo de apartamento e quantidade) ou o medidor de um cálculo de carga instalada. */
export type MedidorCmd =
  | { tipo: "residencial"; tipoApartamento: string; quantidade: number }
  | { tipo: "condominio" | "incendio" | "outro"; calculoId: string };

export type Cmd = {
  id: string;
  nome: string;
  /** Capacidade de medidores, digitada pelo projetista; `null` = não informada. */
  capacidade: number | null;
  medidores: readonly MedidorCmd[];
  ajustes?: AjustesDoNivel;
};

export type Predio = {
  concessionaria: IdConcessionaria;
  /** Tipos de apartamento do cálculo de apartamentos, com a quantidade NO PRÉDIO. */
  tipos: readonly TipoNoNivel[];
  /** Resultados dos cálculos de carga instalada, por id. */
  calculos: readonly CalculoNoNivel[];
  cmds: readonly Cmd[];
  /** Cálculos que entram só no CPG (cargas especiais sem medidor em CMD). */
  calculosSoNoCpg?: readonly string[];
  ajustesCpg?: AjustesDoNivel;
  opcoes?: OpcoesDoNivel;
  uso?: UsoDaEdificacao;
  /** Sistema de tensão do estudo; `null` = não informado. */
  sistema?: Sistema | null;
};

export type ResultadoNivel = ResultadoDoNivel & { atendimento: Atendimento };
export type ResultadoCmd = ResultadoNivel & { id: string; nome: string; medidores: number; avisosDoCmd: Mensagem[] };

export type ResultadoPredio = {
  cmds: ResultadoCmd[];
  cpg: ResultadoNivel;
  /** Avisos do conjunto de CMDs (apartamentos sem CMD ou a mais, cálculo em mais de um CMD). */
  avisos: Mensagem[];
};

/** Nº de medidores do CMD: cada apartamento é um medidor; cada medidor de cálculo, um. */
export function medidoresDoCmd(cmd: Pick<Cmd, "medidores">): number {
  return cmd.medidores.reduce((s, m) => s + (m.tipo === "residencial" ? m.quantidade : 1), 0);
}

/** Spec §6: "CMD sem medidores" e "CMD acima da capacidade". */
export function avisosDoCmd(cmd: Pick<Cmd, "medidores" | "capacidade">): Mensagem[] {
  const n = medidoresDoCmd(cmd);
  if (n === 0) return [MSG.cmdSemMedidores()];
  return cmd.capacidade != null && n > cmd.capacidade ? [MSG.cmdAcimaCapacidade(n, cmd.capacidade)] : [];
}

/** Apartamentos por tipo nos CMDs. */
function apartamentosNosCmds(cmds: readonly Pick<Cmd, "medidores">[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cmds) for (const x of c.medidores) if (x.tipo === "residencial") m.set(x.tipoApartamento, (m.get(x.tipoApartamento) ?? 0) + x.quantidade);
  return m;
}

/**
 * Spec §6: "Apartamentos sem CMD ou a mais" (comparado tipo a tipo; um tipo que sobra não compensa outro que falta)
 * e "Cálculo em mais de um CMD".
 */
export function avisosDosCmds(
  tipos: readonly Pick<TipoNoNivel, "nome" | "quantidade">[],
  cmds: readonly Pick<Cmd, "medidores">[],
  calculos: readonly Pick<CalculoNoNivel, "id" | "nome">[] = [],
): Mensagem[] {
  const nos = apartamentosNosCmds(cmds);
  let sem = 0;
  let aMais = 0;
  for (const t of tipos) {
    const d = t.quantidade - (nos.get(t.nome) ?? 0);
    if (d > 0) sem += d;
    else aMais -= d;
  }
  for (const [nome, q] of nos) if (!tipos.some((t) => t.nome === nome)) aMais += q;

  const avisos: Mensagem[] = [];
  if (sem > 0) avisos.push(MSG.apartamentosSemCmd(sem));
  if (aMais > 0) avisos.push(MSG.apartamentosAMais(aMais));
  for (const calc of calculos) {
    const emQuantos = cmds.filter((c) => c.medidores.some((m) => m.tipo !== "residencial" && m.calculoId === calc.id)).length;
    if (emQuantos > 1) avisos.push(MSG.calculoEmVariosCmd(calc.nome));
  }
  return avisos;
}

function nivel(p: Predio, tipos: TipoNoNivel[], calculos: CalculoNoNivel[], ajustes: AjustesDoNivel | undefined): ResultadoNivel {
  const r = demandaDoNivel({ concessionaria: p.concessionaria, tipos, calculos, ajustes, opcoes: p.opcoes });
  const uso = p.uso ?? (calculos.some((c) => c.papel === "comercial") ? "misto" : "residencial");
  const atendimento = r.demandaKVA == null ? { nivel: null, mensagens: [] } : avisosDeAtendimento(p.concessionaria, { demandaKVA: r.demandaKVA, cargaInstaladaKW: r.cargaInstaladaKW, uso, sistema: p.sistema });
  return { ...r, atendimento };
}

const porId = (p: Predio, id: string) => p.calculos.find((c) => c.id === id);

/** Passos 17 e 18 — demanda de cada CMD e do CPG. */
export function demandaDoPredio(p: Predio): ResultadoPredio {
  const cmds = p.cmds.map((cmd): ResultadoCmd => {
    const qtd = new Map<string, number>();
    const ids: string[] = [];
    for (const m of cmd.medidores) {
      if (m.tipo === "residencial") qtd.set(m.tipoApartamento, (qtd.get(m.tipoApartamento) ?? 0) + m.quantidade);
      else if (!ids.includes(m.calculoId)) ids.push(m.calculoId);
    }
    const tipos = p.tipos.filter((t) => (qtd.get(t.nome) ?? 0) > 0).map((t) => ({ ...t, quantidade: qtd.get(t.nome)! }));
    const calculos = ids.map((id) => porId(p, id)).filter((c): c is CalculoNoNivel => !!c);
    return { id: cmd.id, nome: cmd.nome, medidores: medidoresDoCmd(cmd), avisosDoCmd: avisosDoCmd(cmd), ...nivel(p, tipos, calculos, cmd.ajustes) };
  });

  const idsCpg: string[] = [];
  for (const cmd of p.cmds) for (const m of cmd.medidores) if (m.tipo !== "residencial" && !idsCpg.includes(m.calculoId)) idsCpg.push(m.calculoId);
  for (const id of p.calculosSoNoCpg ?? []) if (!idsCpg.includes(id)) idsCpg.push(id);
  const calculosCpg = idsCpg.map((id) => porId(p, id)).filter((c): c is CalculoNoNivel => !!c);
  const cpg = nivel(p, p.tipos.filter((t) => t.quantidade > 0).map((t) => ({ ...t })), calculosCpg, p.ajustesCpg);

  return { cmds, cpg, avisos: p.cmds.length ? avisosDosCmds(p.tipos, p.cmds, p.calculos) : [] };
}
