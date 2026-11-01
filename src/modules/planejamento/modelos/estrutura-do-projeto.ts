/**
 * A EAP de UM projeto vira a estrutura de um MODELO — PURO. É o caminho inverso do "Usar modelo de EAP": a equipe monta o
 * cronograma de um projeto e quer reaproveitá-lo em outro. Sai no MESMO formato da importação (`estruturaModeloSchema` v1),
 * então o modelo salvo aqui se aplica, se edita e se lista como qualquer outro.
 *
 * Leva a estrutura: árvore, ordem, nome, duração, marcos, vínculos ENTRE as linhas (com tipo e defasagem), a marca de
 * etapa de terceiro, a disciplina (se tem par no catálogo global) e a fase (se é do catálogo global). NÃO leva o que é
 * do projeto: pessoas, horas, %, datas reais, restrições de data, bloqueio. Cada ressalva vira um aviso na prévia.
 */
import { ordemDeDocumento } from "../arvore-lote";
import { estruturaModeloSchema, TIPOS_LINHA_MODELO, type EstruturaModelo, type LinhaModelo } from "./estrutura";

export type LinhaDoProjeto = {
  id: string;
  parentId: string | null;
  ordem: number;
  nome: string;
  tipoEap: string;
  duracaoDias: number;
  disciplinaId: string | null;
  etapaId: string | null;
  deTerceiro: boolean;
  predecessoras: { predecessoraId: string; tipo: "fs" | "ss" | "ff" | "sf"; lagDias: number }[];
};

const NOME_MAX = 300;
const MAX_LINHAS = 1200;

export function estruturaDoProjeto(p: {
  linhas: readonly LinhaDoProjeto[];
  /** `Disciplina.id` do projeto → `DisciplinaCatalogo.id` (ausente = sem par no catálogo). */
  catalogoDaDisciplina: ReadonlyMap<string, string>;
  /** Nome de cada disciplina do projeto, só para os avisos. */
  nomesDasDisciplinas?: ReadonlyMap<string, string>;
  /** Fases do catálogo GLOBAL (`PranchaCatalogo`, `projetoId` nulo): fase do próprio projeto não vale em outro. */
  fasesGlobais: ReadonlySet<string>;
  jornadaMinutos?: number;
}): { estrutura: EstruturaModelo; avisos: string[]; disciplinasSemPar: string[] } {
  if (p.linhas.length === 0) throw new Error("Este projeto ainda não tem EAP para salvar.");
  if (p.linhas.length > MAX_LINHAS) {
    throw new Error(`Este cronograma tem mais de ${MAX_LINHAS} linhas — grande demais para virar modelo. Salve só a parte que a casa reusa.`);
  }

  const porId = new Map(p.linhas.map((l) => [l.id, l]));
  const comFilhas = new Set(p.linhas.map((l) => l.parentId).filter((x): x is string => x != null && porId.has(x)));
  // Pais antes dos filhos, irmãs na ordem da tela; `ordem` do modelo é a posição nessa sequência.
  const sequencia = ordemDeDocumento(p.linhas.map((l) => ({ id: l.id, parentId: l.parentId, ordem: l.ordem, tipoEap: l.tipoEap })));
  const tiposDoModelo = new Set<string>(TIPOS_LINHA_MODELO);

  const semPar = new Map<string, string>();
  let fasesDoProjeto = 0;
  const linhas = sequencia.map((id, i): LinhaModelo => {
    const l = porId.get(id)!;
    const ehResumo = comFilhas.has(id);
    const tipoEap = (tiposDoModelo.has(l.tipoEap) ? l.tipoEap : ehResumo ? "res" : "atv") as LinhaModelo["tipoEap"];

    let disciplinaCatalogoId: string | null = null;
    if (l.disciplinaId) {
      disciplinaCatalogoId = p.catalogoDaDisciplina.get(l.disciplinaId) ?? null;
      if (!disciplinaCatalogoId) semPar.set(l.disciplinaId, p.nomesDasDisciplinas?.get(l.disciplinaId) ?? "sem nome");
    }
    let etapaId: string | null = null;
    if (l.etapaId) {
      if (p.fasesGlobais.has(l.etapaId)) etapaId = l.etapaId;
      else fasesDoProjeto++;
    }
    return {
      id,
      parentId: l.parentId && porId.has(l.parentId) ? l.parentId : null,
      ordem: i,
      nome: l.nome.slice(0, NOME_MAX),
      tipoEap,
      // Agrupamento e marco: 0 (o motor deriva a duração do agrupamento; marco é 0 por definição).
      duracaoDias: ehResumo || tipoEap === "mrc" ? 0 : Math.max(0, Math.min(9999, l.duracaoDias)),
      disciplinaCatalogoId,
      etapaId,
      deTerceiro: l.deTerceiro,
      predecessoras: l.predecessoras
        .filter((v) => porId.has(v.predecessoraId) && v.predecessoraId !== id)
        .slice(0, 50)
        .map((v) => ({ id: v.predecessoraId, tipo: v.tipo, lagDias: Math.max(-999, Math.min(999, v.lagDias)) })),
    };
  });

  const disciplinasSemPar = [...new Set(semPar.values())];
  const avisos: string[] = [];
  for (const nome of disciplinasSemPar) avisos.push(`A disciplina "${nome}" não tem par no catálogo: as linhas dela entram no modelo sem disciplina.`);
  if (fasesDoProjeto > 0) {
    avisos.push(`${fasesDoProjeto === 1 ? "1 linha usa uma fase" : `${fasesDoProjeto} linhas usam uma fase`} que só existe neste projeto: entram no modelo sem fase.`);
  }
  avisos.push("O modelo leva a estrutura, as durações e as predecessoras. Pessoas, horas, % e datas fixadas não vão.");

  const estrutura = estruturaModeloSchema.parse({
    versao: 1,
    jornadaMinutos: p.jornadaMinutos ?? 480,
    linhas,
    mapaDisciplina: {},
    mapaFase: {},
    percentuaisPorFase: {},
    avisos,
  });
  return { estrutura, avisos, disciplinasSemPar };
}
