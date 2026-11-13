import { cargaDaLinha, demandaDaLinha } from "@/modules/ferramentas/calc/cargas-demanda/carga-instalada";
import {
  demandaDoNivel,
  type CalculoNoNivel,
  type IdConcessionaria,
  type ResultadoDoNivel,
  type TipoNoNivel,
} from "@/modules/ferramentas/calc/cargas-demanda/composicao";
import { MSG, type Mensagem } from "@/modules/ferramentas/calc/cargas-demanda/mensagens";
import { demandaDoPredio, type Cmd, type MedidorCmd, type Predio, type ResultadoPredio } from "@/modules/ferramentas/calc/cargas-demanda/niveis";
import { avisosDeAtendimento, type Atendimento, type UsoDaEdificacao } from "@/modules/ferramentas/calc/cargas-demanda/atendimento";
import { validarFp } from "@/modules/ferramentas/calc/cargas-demanda/validacao";

import { ambientesDoLevantamento, type CalculoEstudo, type Concessionaria, type ConteudoCargasDemanda, type LinhaCargaEstudo } from "./conteudo";
import { fdEfetivoDaLinha } from "./fd-linha";
import { totaisDosAmbientes } from "./levantamento";

/**
 * Resultado do estudo — **puro**. Liga o documento (`conteudo.ts`, só entradas) ao motor (`calc/cargas-demanda/`):
 * nada aqui é gravado, a tela e o relatório recalculam sempre. O que falta digitar vira `null` no valor e uma
 * mensagem da spec §6 — nunca um zero.
 *
 *   linha        carga (kW, kVA) = quantidade × P × N, e demanda = P · FD ÷ FP, em kVA        (passos 13 e 14)
 *   cálculo      Σ das linhas, no formato que o nível recebe (`CalculoNoNivel`)
 *   tipos        os tipos de apartamento dos cálculos de área útil, com a carga instalada de uma unidade, quando o tipo
 *                aponta o levantamento que o descreve (Q28)
 *   resumo       a composição do empreendimento todo (todos os cálculos, sem CMD)
 *   prédio       os CMDs e o CPG da etapa 3
 */

const ehNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

// ─── Carga instalada de um levantamento ──────────────────────────────────────────────────────────────────────────

/**
 * Carga instalada (kW) de UMA unidade descrita pelo levantamento: iluminação + tomadas, em W ÷ 1000. `null` = falta
 * dado em algum ambiente (a mesma regra dos totais da etapa 1: o total só existe quando tudo está preenchido).
 */
export function cargaInstaladaDoLevantamentoKW(
  c: Pick<ConteudoCargasDemanda, "levantamentos" | "criterioIluminacao" | "peDireitoM" | "luminarias">,
  levantamentoId: string,
): number | null {
  const lev = c.levantamentos.find((l) => l.id === levantamentoId);
  if (!lev) return null;
  const t = totaisDosAmbientes(ambientesDoLevantamento(lev), c);
  const partes = [t.iluminacao.w, t.tug.w, ...t.equipamentos.map((e) => e.total.w)];
  if (partes.some((w) => w == null)) return null;
  return partes.reduce<number>((s, w) => s + (w as number), 0) / 1000;
}

export type LinhaResumoLevantamento = {
  id: string;
  nome: string;
  /** Carga por parte, em kW (W ÷ 1000). `null` = falta dado no levantamento. */
  iluminacaoKW: number | null;
  tugKW: number | null;
  tueKW: number | null;
  /** Carga instalada de UMA unidade (soma das três partes). */
  unidadeKW: number | null;
  /** Cálculos que usam o levantamento, com o × N de cada um. */
  usadoEm: { calculoId: string; nome: string; quantidade: number }[];
  /** Σ unidade × N dos cálculos que o usam. `null` = falta dado, ou nenhum cálculo o usa. */
  totalKW: number | null;
};

/**
 * Resumo dos levantamentos (empreendimento misto, com lojas): a carga instalada de cada tipo de unidade e o total no
 * estudo, para conferir antes de montar os cálculos. Mesma regra dos totais da etapa 1: só existe total quando tudo está
 * preenchido.
 */
export function resumoDosLevantamentos(c: Pick<ConteudoCargasDemanda, "levantamentos" | "criterioIluminacao" | "peDireitoM" | "luminarias" | "calculos">): LinhaResumoLevantamento[] {
  return c.levantamentos.map((l) => {
    const t = totaisDosAmbientes(ambientesDoLevantamento(l), c);
    const kw = (w: number | null) => (w == null ? null : w / 1000);
    const tueW = somaOuNull(t.equipamentos.map((e) => e.total.w));
    const iluminacaoKW = kw(t.iluminacao.w);
    const tugKW = kw(t.tug.w);
    const tueKW = kw(tueW);
    const unidadeKW = somaOuNull([iluminacaoKW, tugKW, tueKW]);
    const usadoEm = c.calculos.filter((k) => k.escopo.levantamentoIds.includes(l.id)).map((k) => ({ calculoId: k.id, nome: k.nome, quantidade: k.escopo.quantidade }));
    const totalKW = unidadeKW == null || usadoEm.length === 0 ? null : usadoEm.reduce((s, u) => s + unidadeKW * u.quantidade, 0);
    return { id: l.id, nome: l.nome, iluminacaoKW, tugKW, tueKW, unidadeKW, usadoEm, totalKW };
  });
}

// ─── Linha e cálculo de carga instalada ──────────────────────────────────────────────────────────────────────────

export type LinhaCalculada = {
  id: string;
  /** Carga instalada da linha no escopo (× N), sem FD. `null` = falta quantidade, potência ou FP. */
  cargaKW: number | null;
  cargaKVA: number | null;
  /** Σ P · FD no escopo (kW). `null` = falta o FD (ou o resto). */
  demandaKW: number | null;
  /** P · FD ÷ FP (kVA). */
  demandaKVA: number | null;
  /** FD que valeu na conta (digitado, ou o sugerido da regra quando em branco) e se veio do sugerido. */
  fd: number | null;
  fdEhSugerido: boolean;
  /** Campos que ainda faltam na linha, pelo nome da tela ("quantidade", "potência", "FP", "FD"). */
  faltam: string[];
  avisos: Mensagem[];
};

/** Uma linha do cálculo, com o × N do escopo. `fdSugerido` = o que a regra da linha sugere (usado só com o FD em branco). */
export function calcularLinha(l: LinhaCargaEstudo, escopoN: number, fdSugerido: number | null = null): LinhaCalculada {
  const fd = l.fd ?? fdSugerido;
  const faltam: string[] = [];
  const avisos: Mensagem[] = [];
  if (!ehNumero(l.quantidade)) faltam.push("quantidade");
  if (!ehNumero(l.potenciaW)) faltam.push("potência");
  if (!ehNumero(l.fp)) faltam.push("FP");
  else {
    const m = validarFp(l.fp);
    if (m) avisos.push(m);
  }
  if (!ehNumero(fd)) faltam.push("FD");

  const baseOk = ehNumero(l.quantidade) && ehNumero(l.potenciaW) && ehNumero(l.fp) && validarFp(l.fp) === null;
  const carga = baseOk ? cargaDaLinha({ quantidade: l.quantidade!, potenciaW: l.potenciaW!, fp: l.fp! }, escopoN) : null;
  const demandaKVA = baseOk && ehNumero(fd) ? demandaDaLinha({ quantidade: l.quantidade!, potenciaW: l.potenciaW!, fp: l.fp! }, fd, escopoN) : null;
  const demandaKW = carga && ehNumero(fd) ? carga.kW * fd : null;
  return { id: l.id, cargaKW: carga?.kW ?? null, cargaKVA: carga?.kVA ?? null, demandaKW, demandaKVA, fd: fd ?? null, fdEhSugerido: l.fd == null && fdSugerido != null, faltam, avisos };
}

export type CalculoCalculado = {
  id: string;
  linhas: LinhaCalculada[];
  /** Totais do cálculo; `null` = alguma linha incompleta (a tela mostra "—"). */
  cargaKW: number | null;
  cargaKVA: number | null;
  demandaKW: number | null;
  demandaKVA: number | null;
  /** Cálculo pronto para entrar no nível: tem papel e todas as linhas completas. */
  noNivel: CalculoNoNivel | null;
  /** Há linha com campo faltando. */
  incompleto: boolean;
};

const somaOuNull = (vs: readonly (number | null)[]): number | null =>
  vs.some((v) => v == null) ? null : vs.reduce<number>((s, v) => s + (v as number), 0);

/** Cálculo de carga instalada: linhas, totais (passos 13 e 14) e o `CalculoNoNivel` para a composição. */
export function calcularCalculoDeCargaInstalada(k: CalculoEstudo, concessionaria: Concessionaria | null = null): CalculoCalculado {
  const ctx = { concessionaria, escopoN: k.escopo.quantidade, fdAquecimento: k.fdAquecimento };
  const linhas = k.linhas.map((l) => calcularLinha(l, k.escopo.quantidade, fdEfetivoDaLinha(ctx, l).fd));
  const cargaKW = linhas.length ? somaOuNull(linhas.map((l) => l.cargaKW)) : 0;
  const cargaKVA = linhas.length ? somaOuNull(linhas.map((l) => l.cargaKVA)) : 0;
  const demandaKW = linhas.length ? somaOuNull(linhas.map((l) => l.demandaKW)) : 0;
  const demandaKVA = linhas.length ? somaOuNull(linhas.map((l) => l.demandaKVA)) : 0;
  const noNivel: CalculoNoNivel | null = k.papel
    ? { id: k.id, nome: k.nome, papel: k.papel, demandaKVA, demandaKW, cargaInstaladaKW: cargaKW }
    : null;
  return { id: k.id, linhas, cargaKW, cargaKVA, demandaKW, demandaKVA, noNivel, incompleto: linhas.some((l) => l.faltam.length > 0) };
}

// ─── Tipos de apartamento e nível ────────────────────────────────────────────────────────────────────────────────

export type TiposDoEstudo = {
  /** Só os tipos completos (quantidade inteira ≥ 0 e área > 0); o `nome` é o id do tipo (é por ele que o medidor cita). */
  tipos: TipoNoNivel[];
  /** Recusas dos tipos incompletos (spec §6): área ou quantidade inválidas. */
  avisos: Mensagem[];
};

/** Tipos de apartamento de todos os cálculos de área útil do estudo. */
export function tiposDoEstudo(c: ConteudoCargasDemanda): TiposDoEstudo {
  const tipos: TipoNoNivel[] = [];
  const avisos: Mensagem[] = [];
  for (const k of c.calculos) {
    if (k.metodo !== "area_util") continue;
    for (const t of k.apartamentos) {
      const q = t.quantidade;
      const a = t.areaUtilM2;
      if (!(ehNumero(q) && Number.isInteger(q) && q >= 0)) {
        avisos.push(MSG.apartamentosInvalido());
        continue;
      }
      if (!(ehNumero(a) && a > 0)) {
        avisos.push(MSG.areaInvalida());
        continue;
      }
      tipos.push({
        nome: t.id,
        quantidade: q,
        areaUtilM2: a,
        duplex: t.duplex,
        // Carga instalada de UMA unidade do tipo, do levantamento que a descreve (Q28).
        cargaInstaladaKW: t.levantamentoId ? cargaInstaladaDoLevantamentoKW(c, t.levantamentoId) : null,
      });
    }
  }
  return { tipos, avisos: avisos.filter((m, i) => avisos.findIndex((x) => x.id === m.id) === i) };
}

/** Resultado de cada cálculo de carga instalada do estudo, por id. */
export function calculosCalculados(c: ConteudoCargasDemanda): Map<string, CalculoCalculado> {
  const mapa = new Map<string, CalculoCalculado>();
  for (const k of c.calculos) if (k.metodo === "carga_instalada") mapa.set(k.id, calcularCalculoDeCargaInstalada(k, c.concessionaria));
  return mapa;
}

/** Ajustes por nível do empreendimento todo: os digitados nos cálculos de área útil (o último que citar o fator vale). */
function ajustesDoEmpreendimento(c: ConteudoCargasDemanda) {
  const ajustes: { apartamentos: Record<string, number>; duplex: Record<string, number>; composicao: Record<string, number> } = { apartamentos: {}, duplex: {}, composicao: {} };
  for (const k of c.calculos) {
    if (k.metodo !== "area_util" && k.metodo !== "composicao") continue;
    Object.assign(ajustes.apartamentos, k.ajustes.apartamentos ?? {});
    Object.assign(ajustes.duplex, k.ajustes.duplex ?? {});
    Object.assign(ajustes.composicao, k.ajustes.composicao ?? {});
  }
  return ajustes;
}

export type ResumoDoEstudo = {
  /** `null` enquanto não dá para compor (sem concessionária, ou nada lançado). */
  nivel: ResultadoDoNivel | null;
  /** Nível de tensão esperado pela demanda do empreendimento, com o aviso da concessionária. `null` sem demanda calculada. */
  atendimento: Atendimento | null;
  avisos: Mensagem[];
  tipos: TiposDoEstudo;
  calculos: Map<string, CalculoCalculado>;
};

/**
 * Composição do empreendimento inteiro (sem a divisão em CMDs): os apartamentos pelo método da área útil com o total de
 * apartamentos do estudo, mais todos os cálculos de carga instalada que têm papel. É o "Resumo da demanda" da etapa 2.
 */
export function resumoDoEstudo(c: ConteudoCargasDemanda): ResumoDoEstudo {
  const tipos = tiposDoEstudo(c);
  const calculos = calculosCalculados(c);
  const avisos: Mensagem[] = [...tipos.avisos];
  if (!c.concessionaria) return { nivel: null, atendimento: null, avisos, tipos, calculos };
  const noNivel = [...calculos.values()].map((r) => r.noNivel).filter((x): x is CalculoNoNivel => x != null);
  if (tipos.tipos.length === 0 && noNivel.length === 0) return { nivel: null, atendimento: null, avisos, tipos, calculos };
  const nivel = demandaDoNivel({
    concessionaria: c.concessionaria as IdConcessionaria,
    tipos: tipos.tipos.filter((t) => t.quantidade > 0),
    calculos: noNivel,
    ajustes: ajustesDoEmpreendimento(c),
    opcoes: c.centros.opcoes,
  });
  const uso: UsoDaEdificacao = c.centros.uso ?? (noNivel.some((n) => n.papel === "comercial") ? "misto" : "residencial");
  const atendimento =
    nivel.demandaKVA == null
      ? null
      : avisosDeAtendimento(c.concessionaria, { demandaKVA: nivel.demandaKVA, cargaInstaladaKW: nivel.cargaInstaladaKW, uso, sistema: c.sistema ?? null });
  return { nivel, atendimento, avisos: [...avisos, ...nivel.avisos], tipos, calculos };
}

// ─── Prédio (etapa 3) ────────────────────────────────────────────────────────────────────────────────────────────

function medidorDoMotor(m: ConteudoCargasDemanda["centros"]["cmds"][number]["medidores"][number]): MedidorCmd {
  return m.tipo === "residencial" ? { tipo: "residencial", tipoApartamento: m.tipoApartamentoId, quantidade: m.quantidade } : { tipo: m.tipo, calculoId: m.calculoId };
}

function cmdDoMotor(m: ConteudoCargasDemanda["centros"]["cmds"][number]): Cmd {
  return { id: m.id, nome: m.nome, capacidade: m.capacidade, medidores: m.medidores.map(medidorDoMotor), ajustes: m.ajustes };
}

export type ResultadoDoEstudo = {
  predio: ResultadoPredio | null;
  resumo: ResumoDoEstudo;
};

/** Passos 15 a 18 do estudo: CMDs e CPG a partir dos centros do documento. `null` sem concessionária. */
export function calcularPredio(c: ConteudoCargasDemanda): ResultadoDoEstudo {
  const resumo = resumoDoEstudo(c);
  if (!c.concessionaria) return { predio: null, resumo };
  const sistema = c.sistema ?? null;
  const uso: UsoDaEdificacao | undefined = c.centros.uso ?? undefined;
  const predio = demandaDoPredio({
    concessionaria: c.concessionaria as IdConcessionaria,
    tipos: resumo.tipos.tipos,
    calculos: [...resumo.calculos.values()].map((r) => r.noNivel).filter((x): x is CalculoNoNivel => x != null),
    cmds: c.centros.cmds.map(cmdDoMotor),
    calculosSoNoCpg: c.centros.calculosSoNoCpg,
    ajustesCpg: c.centros.ajustesCpg,
    opcoes: c.centros.opcoes,
    uso,
    sistema,
  });
  return { predio, resumo };
}

export type { Predio };
