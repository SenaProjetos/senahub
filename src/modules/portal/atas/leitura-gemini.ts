/**
 * Leitura das "Anotações do Gemini" (Google Meet) — PURO. Recebe o texto (colado, ou extraído do .docx/.md/.txt) e separa
 * resumo, decisões, próximas etapas e detalhes. Conhece as duas gerações de formato vistas nas amostras do escritório
 * (spec 2026-11-22-portal-atas-reuniao-design.md, "O que o Gemini entrega"). Formato que não reconhece vira só resumo,
 * sem itens — nunca erro. Só SUGERE: a coordenação revisa tudo antes de publicar.
 */

export type EtapaLida = { responsavelBruto: string | null; titulo: string; descricao: string | null };
export type DecisaoLida = { titulo: string; descricao: string | null };
export type AnotacoesLidas = {
  titulo: string | null;
  /** "YYYY-MM-DD" lido do cabeçalho. */
  data: string | null;
  resumo: string;
  decisoes: DecisaoLida[];
  etapas: EtapaLida[];
  detalhes: string;
  /** Achou ao menos uma seção do Gemini. */
  reconhecido: boolean;
};

type Secao = "resumo" | "decisoes" | "etapas" | "detalhes";

const MESES: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

export function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tira links, marcações de tempo e escapes de markdown de uma linha. */
function limparLinha(linha: string): string {
  return linha
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, "$1") // [texto](url) → texto
    .replace(/\s*\(\s*\d{2}:\d{2}:\d{2}\s*\)/g, "") // (00:12:26)
    .replace(/\\([[\]\-*_.#()!>`])/g, "$1") // \[ \] \- …
    .replace(/[ \t]+$/g, "");
}

function semEnfeite(linha: string): string {
  return linha.replace(/^[#\s*_]+/, "").replace(/[*_\s:]+$/, "");
}

function secaoDoTitulo(linha: string): Secao | "alinhada" | null {
  const n = normalizarNome(semEnfeite(linha));
  if (n === "resumo") return "resumo";
  if (n === "decisoes") return "decisoes";
  if (n === "proximas etapas" || n === "proximas etapas sugeridas") return "etapas";
  if (n === "detalhes") return "detalhes";
  if (n === "alinhada" || n === "alinhadas") return "alinhada";
  return null;
}

function ehRodape(linha: string): boolean {
  const t = linha.replace(/^[*_\s]+/, "");
  return /^(Revise as anotações do Gemini|Como está a qualidade|Envie feedback)/i.test(t);
}

function ehSeparador(linha: string): boolean {
  return /^\s*_{4,}\s*$/.test(linha);
}

/** Linha do cabeçalho que o Gemini põe antes das seções: data, "Reunião …", "Registros da reunião …", "Anexos …". */
function ehCabecalhoDoGemini(linha: string): boolean {
  const t = linha.trim();
  if (!t) return true;
  if (/^(Reunião\b|Registros da reunião|Anexos\b)/i.test(t)) return true;
  return dataDoCabecalho(t) !== null && t.length <= 40;
}

function dataDoCabecalho(linha: string): string | null {
  const iso = (dia: string, mes: string, ano: string) => {
    const m = MESES[mes.toLowerCase().slice(0, 3)];
    return m ? `${ano}-${m}-${dia.padStart(2, "0")}` : null;
  };
  const a = /(\d{1,2}) de ([a-zç]{3})\.? de (\d{4})/i.exec(linha);
  if (a) return iso(a[1], a[2], a[3]);
  const b = /^([a-zç]{3})\.? (\d{1,2}), (\d{4})/i.exec(linha.trim());
  if (b) return iso(b[2], b[1], b[3]);
  return null;
}

function tirarMarcador(linha: string): { item: boolean; texto: string } {
  const m = /^\s*(?:[-*•]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(linha);
  return m ? { item: true, texto: m[1].trim() } : { item: false, texto: linha.trim() };
}

const NOME_QUE_VAI = /^((?:[A-ZÀ-Ý][\p{L}.'-]*)(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][\p{L}.'-]*){0,5})\s+vai\s+\S/u;

function etapaDaLinha(texto: string): EtapaLida {
  const t = texto.replace(/\*\*/g, "").trim();
  const colchete = /^\[([^\]]+)\]\s*(.*)$/.exec(t);
  if (colchete) {
    const resto = colchete[2].trim();
    const doisPontos = resto.indexOf(":");
    if (doisPontos > 0) {
      const descricao = resto.slice(doisPontos + 1).trim();
      return { responsavelBruto: colchete[1].trim(), titulo: resto.slice(0, doisPontos).trim(), descricao: descricao || null };
    }
    return { responsavelBruto: colchete[1].trim(), titulo: resto, descricao: null };
  }
  const vai = NOME_QUE_VAI.exec(t);
  if (vai) return { responsavelBruto: vai[1].trim(), titulo: t, descricao: null };
  return { responsavelBruto: null, titulo: t, descricao: null };
}

function decisaoDaLinha(texto: string): DecisaoLida {
  const negrito = /^\*\*(.+?)\*\*\s*[:.–-]?\s*(.*)$/.exec(texto.trim());
  if (negrito) return { titulo: negrito[1].trim(), descricao: negrito[2].trim() || null };
  const t = texto.replace(/\*\*/g, "").trim();
  return { titulo: t, descricao: null };
}

/** Junta linhas de um bloco de texto: tira `**`, colapsa linhas em branco repetidas, apara as pontas. */
function bloco(linhas: string[]): string {
  const out: string[] = [];
  for (const l of linhas) {
    const t = l.replace(/\*\*/g, "").replace(/^\s*\*\s+/, "- ").trimEnd();
    if (t.trim() === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(t.trim() === "" ? "" : t);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

export function lerAnotacoes(texto: string): AnotacoesLidas {
  const linhas = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n").map(limparLinha);
  let titulo: string | null = null;
  let data: string | null = null;
  let secao: Secao | null = null;
  const corpo: Record<Secao, string[]> = { resumo: [], decisoes: [], etapas: [], detalhes: [] };
  const semSecao: string[] = [];
  /** Linhas antes da primeira seção que não são o cabeçalho do Gemini: vão para o começo do resumo (nada se perde). */
  const preambulo: string[] = [];
  let achou = false;

  for (const linha of linhas) {
    if (ehRodape(linha) || ehSeparador(linha)) continue;
    const s = secaoDoTitulo(linha);
    if (s === "alinhada") continue;
    if (s) {
      secao = s;
      achou = true;
      continue;
    }
    if (secao === null) {
      const limpa = semEnfeite(linha).trim();
      if (!data) data = dataDoCabecalho(limpa);
      const t = /^Reunião - (.+?)(?:\s+-\s+(?:Transcrição|Anotações do Gemini))?$/.exec(limpa);
      if (t && !titulo) titulo = `Reunião - ${t[1].trim()}`;
      semSecao.push(linha);
      if (!ehCabecalhoDoGemini(limpa)) preambulo.push(linha);
      continue;
    }
    corpo[secao].push(linha);
  }

  if (!achou) {
    return { titulo, data, resumo: bloco(semSecao), decisoes: [], etapas: [], detalhes: "", reconhecido: false };
  }

  const decisoes: DecisaoLida[] = [];
  for (const l of corpo.decisoes) {
    // Linha sem marcador também é decisão: nada do que estava em "Decisões" some.
    const { texto: t } = tirarMarcador(l);
    if (!t) continue;
    decisoes.push(decisaoDaLinha(t));
  }
  const etapas: EtapaLida[] = [];
  for (const l of corpo.etapas) {
    const { texto: t } = tirarMarcador(l);
    if (!t) continue;
    etapas.push(etapaDaLinha(t));
  }

  return {
    titulo,
    data,
    resumo: bloco(preambulo.length > 0 ? [...preambulo, "", ...corpo.resumo] : corpo.resumo),
    decisoes,
    etapas,
    detalhes: bloco(corpo.detalhes),
    reconhecido: true,
  };
}

export type Candidatos = { membros: { id: string; nome: string }[]; contas: { nome: string }[]; cliente: string | null };

const GENERICOS = new Set(["sena engenharia", "o grupo", "grupo", "todos", "equipe"]);

function casa(bruto: string, nomes: readonly string[]): number[] {
  const b = normalizarNome(bruto);
  const completos = nomes.map((n, i) => (normalizarNome(n) === b ? i : -1)).filter((i) => i >= 0);
  if (completos.length > 0) return completos;
  if (b.includes(" ")) return [];
  return nomes.map((n, i) => (normalizarNome(n).split(" ")[0] === b ? i : -1)).filter((i) => i >= 0);
}

/** Sugere o tipo e o responsável de uma próxima etapa. Primeiro nome só vale quando é único. */
export function sugerirTipoEResponsavel(
  bruto: string | null,
  c: Candidatos,
): { tipo: "tarefa_equipe" | "pendencia_cliente"; responsavelId: string | null } {
  const equipe = { tipo: "tarefa_equipe" as const, responsavelId: null };
  if (!bruto || GENERICOS.has(normalizarNome(bruto))) return equipe;
  const membros = casa(bruto, c.membros.map((m) => m.nome));
  if (membros.length === 1) return { tipo: "tarefa_equipe", responsavelId: c.membros[membros[0]].id };
  if (membros.length > 1) return equipe;
  if (casa(bruto, c.contas.map((x) => x.nome)).length === 1) return { tipo: "pendencia_cliente", responsavelId: null };
  if (c.cliente && normalizarNome(c.cliente) === normalizarNome(bruto)) return { tipo: "pendencia_cliente", responsavelId: null };
  return equipe;
}
