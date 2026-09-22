/**
 * Catálogo de teste com DUAS versões do padrão de nomenclatura: a v1 é `CATALOGO_SENA` (produção
 * em 2026-09-15) e a v2 é a tabela da gestão de 2026-09-21 (§3 da spec
 * `docs/superpowers/specs/2026-09-21-nomenclatura-versionada-subdisciplinas.md`), no formato de
 * linhas que a migration e as telas gravam em `SiglaNomenclatura`.
 *
 * Os casos de sigla REDEFINIDA estão aqui de propósito: ESG (sinônimo de HID na v1, sub Esgoto
 * na v2), ACU (card na v1, sub de Arquitetura na v2), SEG (card CFTV na v1, sigla geral de
 * Segurança e Alarme na v2) e as fases/tipos renomeados (BS→BAS, EX→EXE, PQT→QTO).
 */

import { CATALOGO_SENA } from "@/test/catalogo-nomenclatura";
import {
  catalogosDaVersao,
  siglasDasColunas,
  type DisciplinaComSiglas,
  type PranchaComSiglas,
  type SiglaLinha,
  type SubdisciplinaComSiglas,
} from "@/modules/uploads/nomenclatura/siglas-versao";
import { montarVocabulario, type CatalogosNomenclatura, type Vocabulario } from "@/modules/uploads/nomenclatura/vocabulario";

const s = (sigla: string, oficial: boolean, versaoDesde = 1, versaoAte: number | null = null): SiglaLinha => ({
  sigla,
  oficial,
  versaoDesde,
  versaoAte,
});

/** Linhas da v1 (colunas de hoje) com validade trocada: só na v1. */
const soNaV1 = (linhas: SiglaLinha[]) => linhas.map((l) => ({ ...l, versaoAte: 1 }));

export const PADRAO_V1 = "{proj}-{disc}-{fase}-{num}-{tipo}";
export const PADRAO_V2 = "{proj}-SENA-{disc}-{fase}-{num}-{tipo}";

export function catalogoVersionado(): {
  disciplinas: DisciplinaComSiglas[];
  subdisciplinas: SubdisciplinaComSiglas[];
  pranchas: PranchaComSiglas[];
} {
  const v1 = new Map(CATALOGO_SENA.disciplinas.map((d) => [d.id, siglasDasColunas(d.codigo, d.sinonimos ?? [])]));
  const siglasDisc: Record<string, SiglaLinha[]> = {
    ...Object.fromEntries(v1),
    // ESG deixa de ser sinônimo de HID: na v2 é a sub Esgoto.
    "d-hid": [s("HID", true), s("HDR", false), s("ESG", false, 1, 1)],
    "d-spd": [s("SPD", true, 1, 1), s("PDA", true, 2)],
    "d-acu": soNaV1(v1.get("d-acu")!),
    "d-log": soNaV1(v1.get("d-log")!),
    "d-seg": soNaV1(v1.get("d-seg")!),
    // Cards novos da v2. Telecom sem sigla "geral": só as subs identificam o card.
    "d-tel": [],
    "d-sga": [s("SEG", true, 2)],
    "d-fot": [s("FOT", true, 2)],
  };
  const validadeDisc: Record<string, { versaoDesde: number; versaoAte: number | null }> = {
    "d-acu": { versaoDesde: 1, versaoAte: 1 },
    "d-log": { versaoDesde: 1, versaoAte: 1 },
    "d-seg": { versaoDesde: 1, versaoAte: 1 },
    "d-tel": { versaoDesde: 2, versaoAte: null },
    "d-sga": { versaoDesde: 2, versaoAte: null },
    "d-fot": { versaoDesde: 2, versaoAte: null },
  };
  const disciplinas: DisciplinaComSiglas[] = [
    ...CATALOGO_SENA.disciplinas.map((d) => ({ id: d.id, numeracao: d.numeracao ?? null, numeracaoFim: d.numeracaoFim ?? null })),
    { id: "d-tel", numeracao: null, numeracaoFim: null },
    { id: "d-sga", numeracao: null, numeracaoFim: null },
    { id: "d-fot", numeracao: null, numeracaoFim: null },
  ].map((d) => ({
    ...d,
    versaoDesde: validadeDisc[d.id]?.versaoDesde ?? 1,
    versaoAte: validadeDisc[d.id]?.versaoAte ?? null,
    siglas: siglasDisc[d.id] ?? [],
  }));

  const sub = (id: string, card: string, sigla: string): SubdisciplinaComSiglas => ({
    id,
    disciplinaCatalogoId: card,
    versaoDesde: 2,
    versaoAte: null,
    siglas: [s(sigla, true, 2)],
  });
  const subdisciplinas = [
    sub("s-agf", "d-hid", "AGF"),
    sub("s-agq", "d-hid", "AGQ"),
    sub("s-esg", "d-hid", "ESG"),
    sub("s-acu", "d-arq", "ACU"),
    sub("s-con", "d-est", "CON"),
    sub("s-dad", "d-tel", "DAD"),
    sub("s-cam", "d-sga", "CAM"),
  ];

  const siglasPrancha: Record<string, SiglaLinha[]> = {
    "f-pl": [s("PL", true, 1, 1), s("PRE", true, 2)],
    "f-bs": [s("BS", true, 1, 1), s("PB", false, 1, 1), s("BAS", true, 2)],
    "f-ex": [s("EX", true, 1, 1), s("PE", false, 1, 1), s("EXE", false, 1, 1), s("EXE", true, 2)],
    "t-pqt": [s("PQT", true, 1, 1), s("PLQ", false, 1, 1), s("QTO", true, 2)],
    "t-plb": [s("PLB", true, 2)],
    "t-iso": [s("ISO", true, 2)],
  };
  const pranchas: PranchaComSiglas[] = [
    ...CATALOGO_SENA.fases.map((f) => ({ ...f, categoria: "fase" as const })),
    ...CATALOGO_SENA.tipos.map((t) => ({ ...t, categoria: "tipo" as const })),
    { id: "t-plb", sigla: "PLB", categoria: "tipo" as const },
    { id: "t-iso", sigla: "ISO", categoria: "tipo" as const },
  ].map((p) => ({
    id: p.id,
    categoria: p.categoria,
    projetoId: null,
    versaoDesde: p.id === "t-plb" || p.id === "t-iso" ? 2 : 1,
    versaoAte: null,
    siglas: siglasPrancha[p.id] ?? siglasDasColunas(p.sigla, "sinonimos" in p ? (p.sinonimos ?? []) : []),
  }));

  return { disciplinas, subdisciplinas, pranchas };
}

export function catalogoDaVersao(versao: number): CatalogosNomenclatura {
  return catalogosDaVersao(catalogoVersionado(), versao);
}

export function vocabularioDaVersao(versao: number, projetoId: string | null = null): Vocabulario {
  return montarVocabulario(catalogoDaVersao(versao), projetoId);
}
