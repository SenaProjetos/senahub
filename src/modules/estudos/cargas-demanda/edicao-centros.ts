import { MAX_CMDS, MAX_ENTRADAS, MAX_MEDIDORES_POR_CMD, type CmdEstudo, type ConteudoCargasDemanda, type EntradaEstudo } from "./conteudo";
import { entradaVazia } from "./entrada-estudo";
import { novoId } from "./edicao";

/**
 * Edições dos centros de medição e das entradas (etapa 3) — **puras**, no molde de `edicao.ts` e `edicao-calculo.ts`.
 */

export type Medidor = CmdEstudo["medidores"][number];
export type AlvoEntrada = EntradaEstudo["alvo"];

export const MOTIVO_CMDS_CHEIO = `O estudo já tem o máximo de ${MAX_CMDS} CMDs.`;
export const MOTIVO_MEDIDORES_CHEIO = `O CMD já tem o máximo de ${MAX_MEDIDORES_POR_CMD} medidores.`;

export function novoCmd(nome: string): CmdEstudo {
  return { id: novoId("cmd_"), nome, capacidade: null, medidores: [], ajustes: {} };
}

/** Medidor novo: residencial (o 1º tipo de apartamento que houver) ou o de um cálculo. O projetista ajusta a escolha. */
export function novoMedidor(tipo: Medidor["tipo"], referenciaId: string): Medidor {
  return tipo === "residencial" ? { tipo, tipoApartamentoId: referenciaId, quantidade: 1 } : { tipo, calculoId: referenciaId };
}

export function mapCmd(c: ConteudoCargasDemanda, id: string, f: (m: CmdEstudo) => CmdEstudo): ConteudoCargasDemanda {
  return { ...c, centros: { ...c.centros, cmds: c.centros.cmds.map((m) => (m.id === id ? f(m) : m)) } };
}

/** Tira o CMD e a entrada dele (o esquema recusa entrada para um CMD que sumiu). */
export function removerCmd(c: ConteudoCargasDemanda, id: string): ConteudoCargasDemanda {
  return {
    ...c,
    centros: { ...c.centros, cmds: c.centros.cmds.filter((m) => m.id !== id) },
    entradas: c.entradas.filter((e) => !(e.alvo.nivel === "cmd" && e.alvo.cmdId === id)),
  };
}

export function copiarCmd(m: CmdEstudo): CmdEstudo {
  return {
    ...m,
    id: novoId("cmd_"),
    nome: `${m.nome.slice(0, 72)} (cópia)`,
    medidores: m.medidores.map((x) => ({ ...x })),
    ajustes: { apartamentos: m.ajustes.apartamentos && { ...m.ajustes.apartamentos }, duplex: m.ajustes.duplex && { ...m.ajustes.duplex }, composicao: m.ajustes.composicao && { ...m.ajustes.composicao } },
  };
}

// ─── Entradas ────────────────────────────────────────────────────────────────────────────────────────────────────

const mesmoAlvo = (a: AlvoEntrada, b: AlvoEntrada) =>
  a.nivel === b.nivel && (a.nivel === "cpg" || (a.nivel === "cmd" && b.nivel === "cmd" && a.cmdId === b.cmdId) || (a.nivel === "calculo" && b.nivel === "calculo" && a.calculoId === b.calculoId));

/** A entrada gravada do alvo, ou uma sem nenhuma escolha. */
export function entradaDoAlvo(c: Pick<ConteudoCargasDemanda, "entradas">, alvo: AlvoEntrada): EntradaEstudo {
  return c.entradas.find((e) => mesmoAlvo(e.alvo, alvo)) ?? entradaVazia(alvo);
}

/** Grava a entrada do alvo (cria a linha na primeira edição). Sem mudar nada, não acrescenta linha. */
export function definirEntrada(c: ConteudoCargasDemanda, alvo: AlvoEntrada, f: (e: EntradaEstudo) => EntradaEstudo): ConteudoCargasDemanda {
  const atual = entradaDoAlvo(c, alvo);
  const nova = f(atual);
  const existe = c.entradas.some((e) => mesmoAlvo(e.alvo, alvo));
  if (existe) return { ...c, entradas: c.entradas.map((e) => (mesmoAlvo(e.alvo, alvo) ? nova : e)) };
  if (c.entradas.length >= MAX_ENTRADAS) return c;
  return { ...c, entradas: [...c.entradas, nova] };
}

/** Campos de condição de instalação: o CMD e o flat herdam os do CPG quando não têm os seus (disjuntor e seção nunca herdam). */
const CONDICOES = [
  "metodoInstalacao", "isolacao", "material", "carregados", "disposicao", "temperaturaC", "fct", "formaAgrupamento", "circuitos", "camadas", "fca", "resistividadeSoloKmW",
] as const;

/**
 * Entrada com as condições herdadas do CPG ("estas condições de instalação valem também para os CMDs; altere por circuito se
 * precisar"): o campo que o alvo deixou em branco usa o do CPG. O disjuntor e a seção adotados são sempre do próprio alvo.
 */
export function entradaEfetiva(c: Pick<ConteudoCargasDemanda, "entradas">, alvo: AlvoEntrada): EntradaEstudo {
  const propria = entradaDoAlvo(c, alvo);
  if (alvo.nivel === "cpg") return propria;
  const cpg = entradaDoAlvo(c, { nivel: "cpg" });
  const mesclada = { ...propria } as Record<string, unknown>;
  for (const k of CONDICOES) if (mesclada[k] == null) mesclada[k] = cpg[k];
  return mesclada as EntradaEstudo;
}

/** Quantos apartamentos estão distribuídos nos CMDs, e quantos o cálculo tem no prédio. */
export function apartamentosDistribuidos(c: Pick<ConteudoCargasDemanda, "centros" | "calculos">): { nosCmds: number; noPredio: number } {
  const nosCmds = c.centros.cmds.flatMap((m) => m.medidores).reduce((s, md) => s + (md.tipo === "residencial" ? md.quantidade : 0), 0);
  const noPredio = c.calculos.filter((k) => k.metodo === "area_util").flatMap((k) => k.apartamentos).reduce((s, t) => s + (t.quantidade ?? 0), 0);
  return { nosCmds, noPredio };
}
