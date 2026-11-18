import {
  calcular,
  FCT_TABELA,
  fatorAgrupamento,
  type CargaInput,
  type EntradaDemandaInput,
  type Isolacao,
  type LinhaDemanda,
} from "./calc/electrical-demand";

/**
 * Estado de formulário das cargas elétricas — **puro**, compartilhado pela calculadora "Corrente e
 * demanda" e pelo Estudos do projeto. Os campos da tela são texto (o que a pessoa digita, com vírgula);
 * `montarCarga`/`montarCondicoes`/`montarEntrada` convertem para a entrada do motor ou dizem o que falta.
 */

export type Linha = {
  chave: number;
  descricao: string;
  quantidade: string;
  potenciaW: string;
  fp: string;
  rendimento: string;
  fdPct: string;
  tensaoV: string;
  ligacao: "mono" | "tri";
  /** Rótulo do ponto (só no Estudos); "" = sem tipo. Não entra na conta. */
  tipoPonto: string;
};

export type Geral = {
  isolacao: Isolacao;
  temperaturaC: string;
  circuitos: string;
  fctManual: string;
  fcaManual: string;
  alimentacaoTensaoV: string;
  alimentacaoLigacao: "mono" | "tri";
};

export const s = (v: unknown, d: string) => (v != null ? String(v) : d);
/**
 * Texto digitado → número. Não finito ("1e400" = Infinity) vira NaN: passaria nos testes `> 0` e o motor o
 * recusaria com a mensagem padrão do Zod, em inglês; assim a tela diz o que falta, em português.
 */
export const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

let proximaChave = 1;
export const novaLinha = (base?: Partial<Linha>): Linha => ({
  chave: proximaChave++,
  descricao: "",
  quantidade: "1",
  potenciaW: "",
  fp: "1",
  rendimento: "1",
  fdPct: "100",
  tensaoV: "127",
  ligacao: "mono",
  tipoPonto: "",
  ...base,
});

/** Uma carga gravada (entrada do motor) → linha do formulário. */
export function linhaDeCarga(r: Record<string, unknown>): Linha {
  return novaLinha({
    descricao: s(r.descricao, ""),
    quantidade: s(r.quantidade, "1"),
    potenciaW: s(r.potenciaW, ""),
    fp: s(r.fp, "1"),
    rendimento: s(r.rendimento, "1"),
    fdPct: typeof r.fd === "number" ? String(Number((r.fd * 100).toFixed(4))) : "100",
    tensaoV: s(r.tensaoV, "127"),
    ligacao: r.ligacao === "tri" ? "tri" : "mono",
    tipoPonto: s(r.tipoPonto, ""),
  });
}

export function linhasIniciais(e?: Record<string, unknown>): Linha[] {
  const arr = e?.cargas;
  if (!Array.isArray(arr) || arr.length === 0) return [novaLinha()];
  return arr.map((c) => linhaDeCarga(c as Record<string, unknown>));
}

export function geralInicial(e?: Record<string, unknown>): Geral {
  return {
    isolacao: e?.isolacao === "EPR" ? "EPR" : "PVC",
    temperaturaC: s(e?.temperaturaC, "30"),
    circuitos: s(e?.circuitosAgrupados, "1"),
    fctManual: s(e?.fctManual, ""),
    fcaManual: s(e?.fcaManual, ""),
    alimentacaoTensaoV: s(e?.alimentacaoTensaoV, "220"),
    alimentacaoLigacao: e?.alimentacaoLigacao === "mono" ? "mono" : "tri",
  };
}

/** `campo` = onde está o que falta, para a tela levar o foco até ele. */
export type ResultadoCarga = { carga: CargaInput; erro?: undefined } | { carga?: undefined; erro: string; campo: keyof Linha };

/** Uma linha → carga do motor, ou a primeira coisa que falta nela (com o nome da carga). */
export function montarCarga(l: Linha, nome: string): ResultadoCarga {
  const q = num(l.quantidade);
  if (!(Number.isInteger(q) && q > 0)) return { erro: `${nome}: a quantidade deve ser um número inteiro maior que zero.`, campo: "quantidade" };
  if (!(num(l.potenciaW) > 0)) return { erro: `${nome}: informe a potência unitária em W.`, campo: "potenciaW" };
  if (!(num(l.tensaoV) > 0)) return { erro: `${nome}: informe a tensão em V.`, campo: "tensaoV" };
  const fp = num(l.fp);
  const eta = num(l.rendimento);
  const fd = num(l.fdPct) / 100;
  if (!(fp > 0 && fp <= 1)) return { erro: `${nome}: o fator de potência vai de 0,01 a 1.`, campo: "fp" };
  if (!(eta > 0 && eta <= 1)) return { erro: `${nome}: o rendimento vai de 0,01 a 1.`, campo: "rendimento" };
  if (!(fd > 0 && fd <= 1)) return { erro: `${nome}: o fator de demanda vai de 1 % a 100 %.`, campo: "fdPct" };
  return {
    carga: {
      descricao: l.descricao.trim() || nome,
      quantidade: q,
      potenciaW: num(l.potenciaW),
      fp,
      rendimento: eta,
      fd,
      tensaoV: num(l.tensaoV),
      ligacao: l.ligacao,
    },
  };
}

/**
 * Campos da linha que já foram digitados e estão errados (para `aria-invalid`). Campo vazio não conta,
 * exceto a potência quando a pessoa já descreveu a carga: sem ela a linha não entra no cálculo.
 */
export function camposInvalidos(l: Linha): Set<keyof Linha> {
  const invalidos = new Set<keyof Linha>();
  const digitado = (v: string) => v.trim() !== "";
  const q = num(l.quantidade);
  if (digitado(l.quantidade) && !(Number.isInteger(q) && q > 0)) invalidos.add("quantidade");
  if ((digitado(l.potenciaW) || digitado(l.descricao)) && !(num(l.potenciaW) > 0)) invalidos.add("potenciaW");
  if (digitado(l.tensaoV) && !(num(l.tensaoV) > 0)) invalidos.add("tensaoV");
  if (digitado(l.fp) && !(num(l.fp) > 0 && num(l.fp) <= 1)) invalidos.add("fp");
  if (digitado(l.rendimento) && !(num(l.rendimento) > 0 && num(l.rendimento) <= 1)) invalidos.add("rendimento");
  if (digitado(l.fdPct) && !(num(l.fdPct) / 100 > 0 && num(l.fdPct) / 100 <= 1)) invalidos.add("fdPct");
  return invalidos;
}

type Condicoes = Omit<EntradaDemandaInput, "cargas">;
export type ResultadoCondicoes =
  | { condicoes: Condicoes; erro?: undefined }
  | { condicoes?: undefined; erro: string; campo: keyof Geral };

/** Condições de instalação e alimentação geral → entrada do motor, ou a primeira coisa que falta. */
export function montarCondicoes(g: Geral): ResultadoCondicoes {
  const circuitos = num(g.circuitos);
  if (!(Number.isInteger(circuitos) && circuitos > 0)) return { erro: "Circuitos agrupados: informe um número inteiro maior que zero.", campo: "circuitos" };
  if (!(num(g.alimentacaoTensaoV) > 0)) return { erro: "Alimentação geral: informe a tensão em V.", campo: "alimentacaoTensaoV" };
  const c: Condicoes = {
    isolacao: g.isolacao,
    temperaturaC: num(g.temperaturaC),
    circuitosAgrupados: circuitos,
    alimentacaoTensaoV: num(g.alimentacaoTensaoV),
    alimentacaoLigacao: g.alimentacaoLigacao,
  };
  if (g.fctManual.trim() !== "") {
    if (!(num(g.fctManual) > 0 && num(g.fctManual) <= 1.5)) return { erro: "FCT manual: use um valor entre 0 e 1,5.", campo: "fctManual" };
    c.fctManual = num(g.fctManual);
  }
  if (g.fcaManual.trim() !== "") {
    if (!(num(g.fcaManual) > 0 && num(g.fcaManual) <= 1)) return { erro: "FCA manual: use um valor entre 0 e 1.", campo: "fcaManual" };
    c.fcaManual = num(g.fcaManual);
  }
  return { condicoes: c };
}

export type Montagem = { entrada: EntradaDemandaInput; erro?: undefined } | { entrada?: undefined; erro: string };

/** Devolve a entrada ou a primeira coisa que falta (com o número da carga), para a tela orientar. */
export function montarEntrada(linhas: Linha[], g: Geral): Montagem {
  const cargas: CargaInput[] = [];
  for (const [i, l] of linhas.entries()) {
    const r = montarCarga(l, `Carga ${i + 1}`);
    if (r.erro !== undefined) return { erro: r.erro };
    cargas.push(r.carga);
  }
  const c = montarCondicoes(g);
  if (c.erro !== undefined) return { erro: c.erro };
  return { entrada: { cargas, ...c.condicoes } };
}

/** O que falta para calcular. `carga` = índice da linha (ausente = condições ou alimentação). */
export type Pendencia = { texto: string; carga?: number; campo: keyof Linha | keyof Geral };

/**
 * Tudo o que falta, não só o primeiro (`montarEntrada` para no primeiro): uma pendência por carga
 * incompleta, mais a das condições. Alimenta o card de avisos da calculadora.
 */
export function pendenciasDaEntrada(linhas: Linha[], g: Geral): Pendencia[] {
  const pendencias: Pendencia[] = [];
  linhas.forEach((l, i) => {
    const r = montarCarga(l, `Carga ${i + 1}`);
    if (r.erro !== undefined) pendencias.push({ texto: r.erro, carga: i, campo: r.campo });
  });
  const c = montarCondicoes(g);
  if (c.erro !== undefined) pendencias.push({ texto: c.erro, campo: c.campo });
  return pendencias;
}

/** Um fator de correção como a tela mostra: o valor e se veio digitado (`manual`) ou da tabela. */
export type FatorDaTela = { valor: number | null; manual: boolean };

/**
 * FCT e FCA em vigor, mesmo com alguma carga incompleta: o digitado à mão quando é válido (mesma faixa de
 * `montarCondicoes`), senão o da tabela. `null` = a tabela não tem valor (temperatura fora da Tabela 40,
 * circuitos inválidos).
 */
export function fatoresDaTela(g: Geral): { fct: FatorDaTela; fca: FatorDaTela } {
  const fctDigitado = num(g.fctManual);
  const fcaDigitado = num(g.fcaManual);
  const circuitos = num(g.circuitos);
  const fctTabela = (FCT_TABELA[g.isolacao] as Record<number, number>)[num(g.temperaturaC)] ?? null;
  const fcaTabela = Number.isInteger(circuitos) && circuitos > 0 ? fatorAgrupamento(circuitos) : null;
  return {
    fct: g.fctManual.trim() !== "" && fctDigitado > 0 && fctDigitado <= 1.5 ? { valor: fctDigitado, manual: true } : { valor: fctTabela, manual: false },
    fca: g.fcaManual.trim() !== "" && fcaDigitado > 0 && fcaDigitado <= 1 ? { valor: fcaDigitado, manual: true } : { valor: fcaTabela, manual: false },
  };
}

/**
 * Resultado de cada linha completa, com o mesmo motor (`calcular` de uma carga só), para a tabela mostrar
 * Ib, Ib′ e demanda enquanto outra carga ainda falta. Linha incompleta, ou condições inválidas = `null`.
 */
export function linhasCalculadas(linhas: Linha[], g: Geral): (LinhaDemanda | null)[] {
  const c = montarCondicoes(g);
  if (c.erro !== undefined) return linhas.map(() => null);
  return linhas.map((l, i) => {
    const r = montarCarga(l, `Carga ${i + 1}`);
    if (r.erro !== undefined) return null;
    try {
      return calcular({ ...c.condicoes, cargas: [r.carga] }).linhas[0] ?? null;
    } catch {
      // Temperatura fora da Tabela 40 sem FCT manual: o motor recusa (o aviso sai pelo cálculo geral).
      return null;
    }
  });
}
