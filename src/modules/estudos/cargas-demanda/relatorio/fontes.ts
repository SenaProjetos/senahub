import { I_321_0043, N_321_0002 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/celesc-outras";
import { N_321_0003 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/celesc";
import { ND_5_1, ND_5_2, ND_5_3, ND_5_5 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/cemig";
import { NTC_841001, NTC_900600, NTC_901100, NTC_901110, NTC_902210, NTC_903100 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/copel";
import { CATALOGO_ACTI9, CATALOGO_EASY9, CATALOGO_WEG_DWB_DWA } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/disjuntores";
import { ENEL_0280 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/enel-0280-trechos";
import { NDU_042 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/energisa-ndu042";
import { NDU_003 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/energisa";
import { NT_00001, NT_00004, NT_00042, NT_004_2026 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/equatorial";
import { NBR_5410 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/fontes";
import { NBR_8995_1 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/nbr8995";
import { DIS_NOR_030, DIS_NOR_053, DIS_NOR_066 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/neoenergia";
import type { FonteNorma } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/tipos";

/**
 * Normas e catálogos da biblioteca, para a seção "Premissas, normas e edições" e o aviso de edição do relatório — **puro**.
 * A edição e a data vêm do objeto `FonteNorma` (lido da capa do PDF): nada é escrito à mão aqui. O relatório lista só as
 * fontes CITADAS nas referências do estudo (`fontesCitadas`).
 */

export const TODAS_AS_FONTES: readonly FonteNorma[] = [
  NBR_5410, NBR_8995_1, CATALOGO_ACTI9, CATALOGO_WEG_DWB_DWA, CATALOGO_EASY9,
  DIS_NOR_053, DIS_NOR_030, DIS_NOR_066,
  NT_00004, NT_00001, NT_004_2026, NT_00042,
  ND_5_1, ND_5_2, ND_5_3, ND_5_5,
  N_321_0003, N_321_0002, I_321_0043,
  NTC_841001, NTC_900600, NTC_901110, NTC_903100, NTC_902210, NTC_901100,
  NDU_003, NDU_042, ENEL_0280,
];

/** A fonte cujo "documento + edição" abre a referência ("DIS-NOR-053 Rev. 06, Quadro 36" → DIS-NOR-053). `null` = não reconhecida. */
export function fonteDaReferencia(referencia: string): FonteNorma | null {
  // As mensagens da spec §6 citam a norma pelo nome curto ("NBR 5410, Tabela 40", "NT.00004, 6.11.8"): sem o "ABNT " e o ".EQTL".
  const curto = (doc: string) => doc.replace(/^ABNT /, "").replace(/\.EQTL$/, "");
  // A mais específica primeiro (NDU-042 antes de um nome que a contenha).
  const achadas = TODAS_AS_FONTES.filter(
    (f) => referencia.includes(`${f.documento} ${f.edicao}`) || referencia.startsWith(f.documento) || referencia === curto(f.documento) || referencia.startsWith(`${curto(f.documento)},`),
  );
  if (achadas.length === 0) return null;
  return achadas.reduce((a, b) => (b.documento.length > a.documento.length ? b : a));
}

/** As fontes citadas pelas referências, sem repetir, na ordem em que aparecem. */
export function fontesCitadas(referencias: readonly string[], sempre: readonly FonteNorma[] = []): FonteNorma[] {
  const vistas = new Map<string, FonteNorma>();
  for (const f of sempre) vistas.set(f.id, f);
  for (const r of referencias) {
    const f = fonteDaReferencia(r);
    if (f) vistas.set(f.id, f);
  }
  return [...vistas.values()];
}

export const FONTES_DE_DISJUNTORES: readonly FonteNorma[] = [CATALOGO_ACTI9, CATALOGO_WEG_DWB_DWA, CATALOGO_EASY9];

/** "24/02/2027" → "2027-02-24"; `null` se não estiver nesse formato. */
function isoDaData(br: string | undefined): string | null {
  const m = br ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Normas com vigência futura da concessionária (spec §8: "usa-se a mais nova, com aviso") que o estudo NÃO cita — nenhum valor
 * da calculadora vem delas, então não entram na lista de normas da seção 2, mas o relatório avisa na seção 6 que elas existem.
 * Edição, data e título vêm do `FonteNorma`; o texto não resume o conteúdo da norma. Depois da data, o aviso diz que já vale.
 */
export function avisosDeNormasFuturas(emissor: string | null, citadas: readonly FonteNorma[], emissaoIso: string): string[] {
  if (!emissor) return [];
  const ids = new Set(citadas.map((f) => f.id));
  return TODAS_AS_FONTES.filter((f) => f.emissor === emissor && f.situacao === "futura" && !ids.has(f.id)).map((f) => {
    const nome = f.titulo.startsWith(f.documento) ? f.titulo : `${f.documento} — ${f.titulo}`;
    const data = f.valeAPartirDe ?? "data a confirmar";
    const inicio = isoDaData(f.valeAPartirDe);
    const quando = inicio != null && emissaoIso >= inicio ? `está em vigor desde ${data}` : `vale a partir de ${data}`;
    return `${nome} (${f.edicao}) ${quando}. A calculadora não usa valores desta norma; confira se o estudo é afetado.`;
  });
}
export { NBR_5410, NBR_8995_1 };

/** Texto da edição para a tabela: "Rev. 06, 09/09/2025" (a data só quando a edição não a traz). */
export function edicaoPorExtenso(f: FonteNorma): string {
  const base = f.data && !f.edicao.includes(f.data) ? `${f.edicao}, ${f.data}` : f.edicao;
  if (f.situacao === "a_confirmar") return `${base} (edição a confirmar)`;
  if (f.situacao === "futura") return `${base} (vale a partir de ${f.valeAPartirDe ?? "data a confirmar"})`;
  if (f.situacao === "cancelada_estrutura") return `${base} (cancelada; só a estrutura)`;
  return base;
}
