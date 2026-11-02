import {
  geralInicial,
  linhaDeCarga,
  montarCarga,
  montarCondicoes,
  novaLinha,
  type Geral,
  type Linha,
} from "@/modules/ferramentas/carga-linha";

import { conteudoSchema, MAX_AMBIENTES, MAX_CARGAS_ESTUDO, type ConteudoEstudo } from "./conteudo";

/**
 * Estado de formulário do estudo (campos como texto, com vírgula) e a conversão de/para o conteúdo
 * gravado — **puro**. A tela guarda isto; o servidor só vê o `ConteudoEstudo` validado.
 */

export type AmbienteForm = { chave: number; id: string; nome: string; linhas: Linha[] };

export type EstadoEstudo = {
  nome: string;
  ambientes: AmbienteForm[];
  geral: Geral;
  fonte: string;
  observacoes: string;
};

/** Identificador curto e único (ambientes e cargas). Gerado no navegador, em eventos — nunca no render. */
export function novoId(): string {
  // `randomUUID` só existe em contexto seguro (HTTPS/localhost): pela LAN em http o editor não pode quebrar.
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID().replace(/-/g, "").slice(0, 16);
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

let proximaChaveAmbiente = 1;
export const novoAmbiente = (base?: Partial<AmbienteForm>): AmbienteForm => ({
  chave: proximaChaveAmbiente++,
  nome: "",
  linhas: [],
  ...base,
  id: base?.id ?? novoId(),
});

/** Conteúdo gravado → estado da tela. `null` (conteúdo ilegível) abre um estudo vazio com as condições padrão. */
export function estadoInicial(nome: string, c: ConteudoEstudo | null): EstadoEstudo {
  if (!c) return { nome, ambientes: [], geral: geralInicial(), fonte: "", observacoes: "" };
  return {
    nome,
    ambientes: c.ambientes.map((a) => novoAmbiente({ id: a.id, nome: a.nome, linhas: a.cargas.map((x) => linhaDeCarga(x)) })),
    geral: geralInicial(c.condicoes),
    fonte: c.fonteFatorDemanda ?? "",
    observacoes: c.observacoes ?? "",
  };
}

/** Linha que ninguém começou a preencher (sem descrição e sem potência): é ignorada ao calcular e salvar. */
export const linhaEmBranco = (l: Linha) => l.descricao.trim() === "" && l.potenciaW.trim() === "";

export type Montagem = { conteudo: ConteudoEstudo; ignoradas: number; erro?: undefined } | { conteudo?: undefined; ignoradas?: undefined; erro: string };

/** Estado → conteúdo válido, ou a primeira coisa que falta (citando o ambiente e a carga). */
export function montarConteudo(e: EstadoEstudo): Montagem {
  let ignoradas = 0;
  const ambientes = [];
  for (const [ai, a] of e.ambientes.entries()) {
    const nome = a.nome.trim();
    if (!nome) return { erro: `Ambiente ${ai + 1}: dê um nome.` };
    const cargas = [];
    let n = 0;
    for (const l of a.linhas) {
      if (linhaEmBranco(l)) {
        ignoradas += 1;
        continue;
      }
      n += 1;
      const r = montarCarga({ ...l, descricao: l.descricao.trim() || `Carga ${n}` }, `${nome} · Carga ${n}`);
      if (r.erro !== undefined) return { erro: r.erro };
      cargas.push({ ...r.carga, id: novoId(), ...(l.tipoPonto ? { tipoPonto: l.tipoPonto } : {}) });
    }
    ambientes.push({ id: a.id, nome, cargas });
  }
  const c = montarCondicoes(e.geral);
  if (c.erro !== undefined) return { erro: c.erro };
  const fonte = e.fonte.trim();
  const observacoes = e.observacoes.trim();
  const r = conteudoSchema.safeParse({
    ambientes,
    condicoes: c.condicoes,
    ...(fonte ? { fonteFatorDemanda: fonte } : {}),
    ...(observacoes ? { observacoes } : {}),
  });
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Dados inválidos." };
  return { conteudo: r.data, ignoradas };
}

/** Identifica o conteúdo do formulário (sem as chaves internas) para saber se há alteração por salvar. */
export function assinatura(e: EstadoEstudo): string {
  return JSON.stringify({
    nome: e.nome.trim(),
    ambientes: e.ambientes.map((a) => ({ id: a.id, nome: a.nome, linhas: a.linhas.map(({ chave: _c, ...resto }) => (void _c, resto)) })),
    geral: e.geral,
    fonte: e.fonte,
    observacoes: e.observacoes,
  });
}

export const totalDeLinhas = (ambientes: readonly AmbienteForm[]) => ambientes.reduce((s, a) => s + a.linhas.length, 0);

export const podeAdicionarAmbiente = (ambientes: readonly AmbienteForm[]) => ambientes.length < MAX_AMBIENTES;
export const podeAdicionarCarga = (ambientes: readonly AmbienteForm[]) => totalDeLinhas(ambientes) < MAX_CARGAS_ESTUDO;

/** Cópia do ambiente logo abaixo dele, com identificadores novos. Devolve a mesma lista se não couber. */
export function duplicarAmbiente(ambientes: readonly AmbienteForm[], chave: number): AmbienteForm[] {
  const i = ambientes.findIndex((a) => a.chave === chave);
  if (i < 0 || ambientes.length >= MAX_AMBIENTES) return [...ambientes];
  const origem = ambientes[i];
  if (totalDeLinhas(ambientes) + origem.linhas.length > MAX_CARGAS_ESTUDO) return [...ambientes];
  const copia = novoAmbiente({
    nome: origem.nome ? `${origem.nome.slice(0, 72)} (cópia)` : "",
    linhas: origem.linhas.map((l) => ({ ...l, chave: novaLinha().chave })),
  });
  return [...ambientes.slice(0, i + 1), copia, ...ambientes.slice(i + 1)];
}

/** Move a carga para o fim do ambiente de destino (`paraId`). Devolve a mesma lista se algo não existir. */
export function moverCargaParaAmbiente(ambientes: readonly AmbienteForm[], deChave: number, linhaChave: number, paraId: string): AmbienteForm[] {
  const de = ambientes.find((a) => a.chave === deChave);
  const linha = de?.linhas.find((l) => l.chave === linhaChave);
  const para = ambientes.find((a) => a.id === paraId);
  if (!de || !linha || !para || para.chave === de.chave) return [...ambientes];
  return ambientes.map((a) => {
    if (a.chave === de.chave) return { ...a, linhas: a.linhas.filter((l) => l.chave !== linhaChave) };
    if (a.chave === para.chave) return { ...a, linhas: [...a.linhas, linha] };
    return a;
  });
}
