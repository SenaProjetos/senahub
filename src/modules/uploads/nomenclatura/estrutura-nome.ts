/**
 * Regras ESTRUTURAIS do nome — as únicas que o motor conhece sem catálogo (ADR-0003, regra 4):
 * sufixo de cópia, datas, revisão e código de projeto. Nenhuma sigla de disciplina/fase/tipo aqui.
 */

export type Copia = { data: string; sequencia: number };

export type SufixosRemovidos = {
  base: string;
  /** `[cópia 2026-09-14_05]` — gerado pelo AltoQi a cada cópia de backup. */
  copia: Copia | null;
  /** `(2)` do Windows ou `- Cópia`: mesmo arquivo duplicado, não revisão. */
  duplicata: boolean;
};

const RE_COPIA_ALTOQI = /\s*\[\s*c[oó]pia\s+(\d{4}-\d{2}-\d{2})_(\d{1,3})\s*\]\s*$/i;
const RE_COPIA_WINDOWS = /\s*-\s*c[oó]pia(?:\s*\(\d{1,3}\))?\s*$/i;
const RE_DUPLICATA = /\s*\(\d{1,3}\)\s*$/;

/** Tira, do fim do nome (sem extensão), os sufixos que só existem porque o arquivo foi copiado. */
export function removerSufixosDeCopia(base: string): SufixosRemovidos {
  let atual = base;
  let copia: Copia | null = null;
  let duplicata = false;
  // Os sufixos podem se empilhar (`x [cópia …] (2)`): repete até estabilizar.
  for (let mudou = true; mudou; ) {
    mudou = false;
    const altoqi = atual.match(RE_COPIA_ALTOQI);
    if (altoqi) {
      copia ??= { data: altoqi[1], sequencia: Number(altoqi[2]) };
      atual = atual.slice(0, altoqi.index);
      mudou = true;
      continue;
    }
    for (const re of [RE_COPIA_WINDOWS, RE_DUPLICATA]) {
      const m = atual.match(re);
      if (m && m.index !== undefined && m.index > 0) {
        duplicata = true;
        atual = atual.slice(0, m.index);
        mudou = true;
      }
    }
  }
  return { base: atual.trim(), copia, duplicata };
}

function dataValida(dia: number, mes: number): boolean {
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31;
}

/**
 * Remove datas válidas do texto, trocando cada uma por um separador. Sem isso o `2026` de uma data
 * vira "número da prancha" na faixa da Pavimentação (visto no diagnóstico de produção).
 * Sequência numérica que não forma data válida fica onde está.
 */
export function removerDatas(texto: string): { texto: string; datas: string[] } {
  const datas: string[] = [];
  const trocar = (original: string, iso: string | null) => {
    if (!iso) return original;
    datas.push(iso);
    return "-";
  };
  let saida = texto
    // 20231123140856 (data+hora) e 20260915
    .replace(/(?<!\d)(20\d{2})(\d{2})(\d{2})(\d{6})?(?!\d)/g, (m, a, mm, d) =>
      trocar(m, dataValida(Number(d), Number(mm)) ? `${a}-${mm}-${d}` : null),
    )
    // 2026-09-15, 2026_09_15, 2026.09.15
    .replace(/(?<!\d)(\d{4})[-_.](\d{2})[-_.](\d{2})(?!\d)/g, (m, a, mm, d) =>
      trocar(m, dataValida(Number(d), Number(mm)) ? `${a}-${mm}-${d}` : null),
    );
  // 15-09-2026, 15.09.26, 19_06_26
  saida = saida.replace(/(?<!\d)(\d{2})[-_.](\d{2})[-_.](\d{4}|\d{2})(?!\d)/g, (m, d, mm, a) =>
    trocar(m, dataValida(Number(d), Number(mm)) ? `${a.length === 2 ? `20${a}` : a}-${mm}-${d}` : null),
  );
  return { texto: saida, datas };
}

/** Prefixos que, seguidos de número, formam revisão (`REV-02` chega aqui já como `REV` + `02`). */
export const PREFIXOS_REVISAO = new Set(["R", "RV", "REV", "REVISAO"]);

/** `R02`, `RV3`, `REV01`, `REVISAO01` → número. Número isolado NUNCA é revisão. */
export function revisaoDaParte(parte: string): number | null {
  const m = parte.match(/^(?:R|RV|REV|REVISAO)(\d{1,3})$/);
  return m ? Number(m[1]) : null;
}

export type CodigoProjetoLido = {
  ano: number;
  sequencial: number;
  subprojeto: number | null;
  /** Trecho do nome ORIGINAL que continha o código (para renumerar sem mexer no resto). */
  texto: string;
};

/**
 * Código de projeto no início do nome: ano com 2 dígitos + sequencial, subprojeto opcional
 * (`2527` → 25/27, `26013` → 26/13, `260032` → 26/32, `26001.1` e `26001-1` → 26/1 sub 1).
 * Aceita prefixo `P`/`PRJ`/`PROJ`. `anoReferencia` descarta leituras implausíveis (`5000-…` não é
 * o ano 2050): o ano lido precisa estar entre 2010 e o ano do projeto + 1.
 */
export function lerCodigoProjetoNoInicio(base: string, anoReferencia: number): CodigoProjetoLido | null {
  const m = base.match(/^\s*(?:(?:PRJ|PROJ|P)[-_.\s]?)?(\d{3,6})(?:[.-](\d{1,2}))?(?=[-_.\s]|$)/i);
  if (!m) return null;
  const digitos = m[1];
  const ano = Number(digitos.slice(0, 2));
  const sequencial = Number(digitos.slice(2));
  const anoMax = (anoReferencia % 100) + 1;
  if (ano < 10 || ano > anoMax) return null;
  return { ano, sequencial, subprojeto: m[2] !== undefined ? Number(m[2]) : null, texto: m[0] };
}
