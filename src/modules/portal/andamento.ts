/**
 * Andamento por fase e linha do tempo do portal do cliente (spec
 * docs/superpowers/specs/2026-11-19-portal-andamento-linha-do-tempo-design.md). Puro: sem Prisma, sem I/O.
 *
 * A fonte é o MESMO conteúdo das Entregas (`ConteudoPublico`), então andamento, linha do tempo e Entregas nunca
 * discordam. O status da fase é o fluxo INTERNO (projetista ↔ coordenação) — por isso não é mostrado cru:
 * - D2/D3: a fase só é "Concluída" para o cliente quando está aprovada E ao menos UMA prancha dela está nas
 *   Entregas (compartilhada ou liberada para obra);
 * - D5: a linha do tempo só fala do que está nas Entregas hoje, e marcação sem data fica fora (nunca inventada).
 */
import type { StatusDisciplina } from "@/generated/prisma/client";
import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import type { Situacao } from "@/modules/uploads/revisao-marcada";
import { FASE_SEM } from "@/modules/uploads/arvore-navegacao";
import { diaDeSaoPaulo } from "@/lib/data";

export type SituacaoCliente = "nao_iniciada" | "em_andamento" | "concluida";
export type FaseEntrada = { faseId: string; sigla: string; status: StatusDisciplina; entregueEm: Date | null; percentual: number; ordem: number };
/** `fases` já na ordem; a lista de disciplinas, na ordem do projeto. */
export type DisciplinaEntrada = { id: string; nome: string; status: StatusDisciplina; entregueEm: Date | null; fases: FaseEntrada[] };
/** Um documento (prancha) numa pasta do cliente. `marcadaEm` nulo = marcação antiga, sem data conhecida. */
export type MarcaEntrada = { documentoId: string; disciplinaId: string; faseId: string | null; situacao: Situacao; marcadaEm: Date | null };
/** `concluidaEm` = dia de São Paulo (`YYYY-MM-DD`). Disciplina sem fase = um item com `faseId`/`sigla` nulos. */
export type FaseAndamento = { faseId: string | null; sigla: string | null; situacao: SituacaoCliente; concluidaEm: string | null };
export type DisciplinaAndamento = { id: string; nome: string; percentual: number; fases: FaseAndamento[] };
export type Andamento = { percentual: number; disciplinas: DisciplinaAndamento[] };
export type TipoItemLinha = "liberado_obra" | "compartilhado" | "fase_concluida";
export type ItemLinhaDoTempo = {
  dia: string;
  disciplinaId: string;
  disciplina: string;
  tipo: TipoItemLinha;
  quantidade: number;
  faseSigla: string | null;
  texto: string;
};

export function chaveMarca(documentoId: string, situacao: Situacao): string {
  return `${documentoId}:${situacao}`;
}

/**
 * Uma marca por documento e situação, tirada das pastas das Entregas. PDF + DWG da mesma prancha = uma marca.
 * Upload sem documento conhecido fica fora (não há prancha a contar).
 */
export function marcasDoConteudo(
  conteudo: ConteudoPublico | null,
  documentoDoUpload: ReadonlyMap<string, string>,
  dataDaMarca: ReadonlyMap<string, Date>,
): MarcaEntrada[] {
  const marcas = new Map<string, MarcaEntrada>();
  for (const s of conteudo?.situacoes ?? []) {
    for (const disciplina of s.disciplinas) {
      for (const pasta of disciplina.pastas) {
        const faseId = pasta.chave === FASE_SEM ? null : pasta.chave;
        for (const ext of pasta.extensoes) {
          for (const a of ext.arquivos) {
            const documentoId = documentoDoUpload.get(a.id);
            if (!documentoId) continue;
            const chave = chaveMarca(documentoId, s.id);
            if (marcas.has(chave)) continue;
            marcas.set(chave, {
              documentoId,
              disciplinaId: disciplina.id,
              faseId,
              situacao: s.id,
              marcadaEm: dataDaMarca.get(chave) ?? null,
            });
          }
        }
      }
    }
  }
  return [...marcas.values()];
}

const maisAntiga = (datas: (Date | null)[]): Date | null =>
  datas.reduce<Date | null>((min, x) => (x && (!min || x.getTime() < min.getTime()) ? x : min), null);

const maisRecente = (a: Date | null, b: Date | null): Date | null => (!a ? b : !b ? a : a.getTime() >= b.getTime() ? a : b);

/** Situação para o cliente de uma fase (ou da disciplina sem fase) dadas as marcas dela nas Entregas. */
function situacaoDe(status: StatusDisciplina, entregueEm: Date | null, marcas: MarcaEntrada[]): Omit<FaseAndamento, "faseId" | "sigla"> {
  if (status === "aguardando") return { situacao: "nao_iniciada", concluidaEm: null };
  if (status !== "aprovado" || marcas.length === 0) return { situacao: "em_andamento", concluidaEm: null };
  const data = maisRecente(entregueEm, maisAntiga(marcas.map((m) => m.marcadaEm)));
  return { situacao: "concluida", concluidaEm: data ? diaDeSaoPaulo(data) : null };
}

function andamentoDaDisciplina(d: DisciplinaEntrada, marcas: MarcaEntrada[]): DisciplinaAndamento {
  const minhas = marcas.filter((m) => m.disciplinaId === d.id);
  if (d.fases.length === 0) {
    const s = situacaoDe(d.status, d.entregueEm, minhas);
    return { id: d.id, nome: d.nome, percentual: s.situacao === "concluida" ? 100 : 0, fases: [{ faseId: null, sigla: null, ...s }] };
  }
  const fases = d.fases.map((f) => ({
    faseId: f.faseId,
    sigla: f.sigla,
    ...situacaoDe(f.status, f.entregueEm, minhas.filter((m) => m.faseId === f.faseId)),
  }));
  // O plano de percentuais pode estar em rascunho (não somar 100) — divide pelo que ele soma; tudo zero conta fases.
  const total = d.fases.reduce((s, f) => s + f.percentual, 0);
  const feito = d.fases.reduce((s, f, i) => s + (fases[i].situacao === "concluida" ? (total > 0 ? f.percentual : 1) : 0), 0);
  const percentual = (feito / (total > 0 ? total : d.fases.length)) * 100;
  return { id: d.id, nome: d.nome, percentual, fases };
}

export function andamentoDoProjeto(disciplinas: DisciplinaEntrada[], marcas: MarcaEntrada[]): Andamento {
  const lista = disciplinas.map((d) => andamentoDaDisciplina(d, marcas));
  const media = lista.length === 0 ? 0 : lista.reduce((s, d) => s + d.percentual, 0) / lista.length;
  return {
    percentual: Math.round(media),
    disciplinas: lista.map((d) => ({ ...d, percentual: Math.round(d.percentual) })),
  };
}

const ORDEM_TIPO: Record<TipoItemLinha, number> = { liberado_obra: 0, compartilhado: 1, fase_concluida: 2 };

function textoDasPranchas(tipo: Situacao, n: number): string {
  if (tipo === "liberado_obra") return n === 1 ? "1 prancha liberada para obra" : `${n} pranchas liberadas para obra`;
  return n === 1 ? "1 prancha compartilhada com você" : `${n} pranchas compartilhadas com você`;
}

/** O que já aconteceu, do mais novo para o mais antigo, agrupado por dia (São Paulo), disciplina e tipo. */
export function linhaDoTempo(disciplinas: DisciplinaEntrada[], marcas: MarcaEntrada[], andamento: Andamento): ItemLinhaDoTempo[] {
  const ordemDisciplina = new Map(disciplinas.map((d, i) => [d.id, i]));
  const nomeDisciplina = new Map(disciplinas.map((d) => [d.id, d.nome]));
  const grupos = new Map<string, ItemLinhaDoTempo>();

  for (const m of marcas) {
    if (!m.marcadaEm || !nomeDisciplina.has(m.disciplinaId)) continue;
    const dia = diaDeSaoPaulo(m.marcadaEm);
    const chave = `${dia}|${m.disciplinaId}|${m.situacao}`;
    const g = grupos.get(chave);
    if (g) g.quantidade += 1;
    else
      grupos.set(chave, {
        dia,
        disciplinaId: m.disciplinaId,
        disciplina: nomeDisciplina.get(m.disciplinaId)!,
        tipo: m.situacao,
        quantidade: 1,
        faseSigla: null,
        texto: "",
      });
  }
  const itens = [...grupos.values()].map((g) => ({ ...g, texto: textoDasPranchas(g.tipo as Situacao, g.quantidade) }));

  for (const d of andamento.disciplinas) {
    for (const f of d.fases) {
      if (f.situacao !== "concluida" || !f.concluidaEm) continue;
      itens.push({
        dia: f.concluidaEm,
        disciplinaId: d.id,
        disciplina: d.nome,
        tipo: "fase_concluida",
        quantidade: 1,
        faseSigla: f.sigla,
        texto: f.sigla ? `Fase ${f.sigla} concluída` : "Disciplina concluída",
      });
    }
  }

  return itens.sort(
    (a, b) =>
      b.dia.localeCompare(a.dia) ||
      ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] ||
      (ordemDisciplina.get(a.disciplinaId) ?? 0) - (ordemDisciplina.get(b.disciplinaId) ?? 0),
  );
}
