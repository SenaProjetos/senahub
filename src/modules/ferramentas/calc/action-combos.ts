/**
 * Engine E14 — Combinações de ações ELU/ELS (NBR 8681:2003).
 * Puro. Trabalha com valores escalares quaisquer (kN, kN·m, kN/m…) — combina valores
 * característicos em valores de cálculo. Unidade é responsabilidade do usuário (homogênea).
 *
 * ELU (γ por tipo, Tabela 11.1 da NBR 6118:2014, consistente com a NBR 8681):
 *   Fd = Σ γg·Gk + γq·(Q1k + Σ ψ0j·Qjk)      — varia a ação variável principal Q1.
 * ELS (NBR 8681 / NBR 6118 Tabela 11.4, permanentes a γ=1):
 *   Quase-permanente: Fd = ΣGk + Σ ψ2j·Qjk
 *   Frequente:        Fd = ΣGk + ψ1·Q1k + Σ ψ2j·Qjk
 *   Rara:             Fd = ΣGk + Q1k + Σ ψ1j·Qjk
 *
 * Limite documentado: a combinação excepcional usa aqui a mesma estrutura da normal (ψ0 nas
 * secundárias) com os γ excepcionais. A NBR 8681 (5.1.5) admite ψ0,ef e o valor próprio da ação
 * excepcional — o engenheiro deve ajustar quando aplicável.
 */

import { z } from "zod";

/** Fatores de combinação ψ por tipo de ação variável (NBR 8681 Tab. 6 / NBR 6118 Tab. 11.2). */
export const TIPOS_VARIAVEL = {
  residencial: { label: "Cargas acidentais — residências", psi0: 0.5, psi1: 0.4, psi2: 0.3 },
  comercial: { label: "Acidentais — escritórios, lojas, equipamentos", psi0: 0.7, psi1: 0.6, psi2: 0.4 },
  biblioteca: { label: "Acidentais — bibliotecas, arquivos, garagens, oficinas", psi0: 0.8, psi1: 0.7, psi2: 0.6 },
  vento: { label: "Vento", psi0: 0.6, psi1: 0.3, psi2: 0.0 },
  temperatura: { label: "Variação de temperatura", psi0: 0.6, psi1: 0.5, psi2: 0.3 },
} as const;
export type TipoVariavel = keyof typeof TIPOS_VARIAVEL;

/** Coeficientes γ por tipo de combinação última (Tabela 11.1 NBR 6118:2014). */
export const GAMA = {
  normal: { ggDesf: 1.4, ggFav: 1.0, gq: 1.4 },
  especial: { ggDesf: 1.3, ggFav: 1.0, gq: 1.2 },
  excepcional: { ggDesf: 1.2, ggFav: 1.0, gq: 1.0 },
} as const;
export type TipoCombinacaoELU = keyof typeof GAMA;

export const entradaSchema = z.object({
  permanentes: z
    .array(
      z.object({
        nome: z.string().min(1),
        gk: z.number(), // valor característico (pode ser negativo se aliviante)
        favoravel: z.boolean().default(false),
      }),
    )
    .min(1),
  variaveis: z
    .array(
      z.object({
        nome: z.string().min(1),
        qk: z.number().min(0),
        tipo: z.enum(Object.keys(TIPOS_VARIAVEL) as [TipoVariavel, ...TipoVariavel[]]),
      }),
    )
    .default([]),
});

export type EntradaCombos = z.infer<typeof entradaSchema>;
export type EntradaCombosInput = z.input<typeof entradaSchema>;

export type Combinacao = {
  /** Ação variável principal (null = só permanentes / quase-permanente). */
  principal: string | null;
  fd: number;
};

export type GrupoCombinacao = {
  combinacoes: Combinacao[];
  /** Combinação governante (maior Fd em módulo). */
  governante: Combinacao;
};

export type ResultadoCombos = {
  elu: Record<TipoCombinacaoELU, GrupoCombinacao>;
  els: {
    quasePermanente: Combinacao;
    frequente: GrupoCombinacao;
    rara: GrupoCombinacao;
  };
};

function governante(combs: Combinacao[]): Combinacao {
  return combs.reduce((m, c) => (Math.abs(c.fd) >= Math.abs(m.fd) ? c : m), combs[0]);
}

export function calcular(input: EntradaCombosInput): ResultadoCombos {
  const v = entradaSchema.parse(input);
  const vars = v.variaveis;
  const psi = (i: number) => TIPOS_VARIAVEL[vars[i].tipo];

  // Soma de permanentes para ELU (γg conforme favorável/desfavorável) e ELS (γ=1).
  const sumGelu = (g: { ggDesf: number; ggFav: number; gq: number }) =>
    v.permanentes.reduce((s, p) => s + (p.favoravel ? g.ggFav : g.ggDesf) * p.gk, 0);
  const sumGserv = v.permanentes.reduce((s, p) => s + p.gk, 0);

  // ── ELU: Fd = ΣγgGk + γq(Q1k + Σψ0j·Qjk), variando o principal ──
  const elu = {} as Record<TipoCombinacaoELU, GrupoCombinacao>;
  (Object.keys(GAMA) as TipoCombinacaoELU[]).forEach((tipo) => {
    const g = GAMA[tipo];
    const baseG = sumGelu(g);
    let combs: Combinacao[];
    if (vars.length === 0) {
      combs = [{ principal: null, fd: baseG }];
    } else {
      combs = vars.map((q1, k) => {
        const secund = vars.reduce((s, q, j) => (j === k ? s : s + psi(j).psi0 * q.qk), 0);
        return { principal: q1.nome, fd: baseG + g.gq * (q1.qk + secund) };
      });
    }
    elu[tipo] = { combinacoes: combs, governante: governante(combs) };
  });

  // ── ELS ──
  // Quase-permanente: ΣGk + Σψ2·Qjk
  const qpFd = sumGserv + vars.reduce((s, q, j) => s + psi(j).psi2 * q.qk, 0);
  const quasePermanente: Combinacao = { principal: null, fd: qpFd };

  // Frequente: ΣGk + ψ1·Q1k + Σψ2j·Qjk
  let freqCombs: Combinacao[];
  let raraCombs: Combinacao[];
  if (vars.length === 0) {
    freqCombs = [{ principal: null, fd: sumGserv }];
    raraCombs = [{ principal: null, fd: sumGserv }];
  } else {
    freqCombs = vars.map((q1, k) => {
      const secund = vars.reduce((s, q, j) => (j === k ? s : s + psi(j).psi2 * q.qk), 0);
      return { principal: q1.nome, fd: sumGserv + psi(k).psi1 * q1.qk + secund };
    });
    // Rara: ΣGk + Q1k + Σψ1j·Qjk
    raraCombs = vars.map((q1, k) => {
      const secund = vars.reduce((s, q, j) => (j === k ? s : s + psi(j).psi1 * q.qk), 0);
      return { principal: q1.nome, fd: sumGserv + q1.qk + secund };
    });
  }

  return {
    elu,
    els: {
      quasePermanente,
      frequente: { combinacoes: freqCombs, governante: governante(freqCombs) },
      rara: { combinacoes: raraCombs, governante: governante(raraCombs) },
    },
  };
}
