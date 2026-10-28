/**
 * Regras puras da aba "Problemas" do projeto e da conversa de uma pendência.
 * Puro: sem Prisma, sem server-only, sem Next — a tela e o servidor usam as mesmas regras.
 */

import { STATUS_ABERTOS, type PapeisPendencia } from "./helpers";

/** Frase que o servidor lança quando quem não participa tenta agir na pendência. */
export const MOTIVO_NAO_PARTICIPA = "Só um responsável da disciplina pode alterar esta pendência.";

/**
 * Participante da conversa de um apontamento: o autor dele, um responsável da disciplina
 * ou o perfil global (atua em disciplina alheia). Mais largo que o gate de quem aponta
 * (`uploads:validar`) de propósito: o projetista é o outro lado da conversa.
 */
export function podeParticiparDaConversa(a: {
  autorId: string;
  usuarioId: string;
  ehResponsavel: boolean;
  ehGlobal: boolean;
}): boolean {
  return a.autorId === a.usuarioId || a.ehResponsavel || a.ehGlobal;
}

/**
 * A aba Problemas mostra só o que foi publicado e não está na lixeira: rascunho (`publicadoEm`
 * nulo) é de quem escreveu e ainda não chegou ao projetista, de QUALQUER autor.
 */
export function ehPublicada(p: { publicadoEm: Date | string | null; excluidoEm: Date | string | null }): boolean {
  return p.publicadoEm != null && p.excluidoEm == null;
}

/** Extensão em minúsculas, sem ponto (`""` quando o nome não tem extensão). */
export function extensaoDoArquivo(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

/**
 * Arquivo vigente de um documento PARA UM PINO: o mais novo (maior `versao`) dentre os que têm a
 * MESMA extensão do arquivo de origem do apontamento, fora da lixeira e não substituídos.
 * Um documento guarda PDF e DWG da mesma prancha e `versao` é contador por arquivo — sem este
 * filtro o vigente poderia ser o .dwg, que não tem pinos. `null` = nenhum arquivo disponível.
 */
export function escolherVigente<
  T extends { nomeArquivo: string; versao: number; excluidoEm?: Date | string | null; substituidoPorId?: string | null },
>(uploads: T[], extensaoOrigem: string): T | null {
  let melhor: T | null = null;
  for (const u of uploads) {
    if (u.excluidoEm != null || u.substituidoPorId != null) continue;
    if (extensaoDoArquivo(u.nomeArquivo) !== extensaoOrigem) continue;
    if (melhor === null || u.versao > melhor.versao) melhor = u;
  }
  return melhor;
}

export type SituacaoProblema = "em_aberto" | "aguardando" | "encerrados";

/** Em qual das três abas da tela "Problemas" cai um status (`null` = status que a tela não conhece). */
export function situacaoDoStatus(status: string): SituacaoProblema | null {
  if ((STATUS_ABERTOS as readonly string[]).includes(status)) return "em_aberto";
  if (status === "resolvida") return "aguardando";
  if (status === "fechada" || status === "descartada" || status === "adiado") return "encerrados";
  return null;
}

/** Linha da aba Problemas — DTO serializável (datas em ISO), montado no servidor. */
export type ProblemaLinha = {
  id: string;
  numero: number;
  texto: string;
  pagina: number;
  status: string;
  severidade: string | null;
  tipo: string | null;
  prazo: string | null;
  createdAt: string;
  fechadoEm: string | null;
  autorId: string;
  autor: string;
  tarefaId: string | null;
  disciplinaId: string;
  disciplinaNome: string;
  arquivo: string;
  uploadIdOrigem: string;
  uploadIdVigente: string | null;
  arquivoDisponivel: boolean;
  deOutraRevisao: boolean;
  revisaoOrigemId: string | null;
  revisaoVigenteId: string | null;
  revisaoVigenteNumero: number;
  respostas: { id: string; autor: string; autorId: string; texto: string; createdAt: string }[];
  papeis: PapeisPendencia;
};

/**
 * Quem enxerga uma linha da aba: a MESMA regra que abre a prancha no visualizador
 * (`projetos/[id]/arquivos/[uploadId]/visualizar/page.tsx`) — escopo global, membro do projeto ou
 * responsável pela disciplina daquele arquivo. Mostrar o problema a quem não abre a prancha
 * entregaria o texto e a conversa de uma disciplina alheia (e o "Abrir na prancha" daria 404).
 */
export function podeVerProblema(a: { global: boolean; membro: boolean; responsavelDaDisciplina: boolean }): boolean {
  return a.global || a.membro || a.responsavelDaDisciplina;
}

export const SITUACAO_LABEL: Record<SituacaoProblema, string> = {
  em_aberto: "Em aberto",
  aguardando: "Aguardando verificação",
  encerrados: "Encerrados",
};

export const SITUACOES: readonly SituacaoProblema[] = ["em_aberto", "aguardando", "encerrados"];

type FiltrosDeClassificacao = { severidade: string | "todas" | "sem"; tipo: string | "todos" };

function casaComClassificacao(l: ProblemaLinha, f: FiltrosDeClassificacao): boolean {
  if (f.severidade === "sem" ? l.severidade != null : f.severidade !== "todas" && l.severidade !== f.severidade) return false;
  if (f.tipo !== "todos" && l.tipo !== f.tipo) return false;
  return true;
}

export function filtrarProblemas(
  linhas: ProblemaLinha[],
  f: { situacao: SituacaoProblema } & FiltrosDeClassificacao,
): ProblemaLinha[] {
  return linhas.filter((l) => situacaoDoStatus(l.status) === f.situacao && casaComClassificacao(l, f));
}

/** Contagem por situação; com `filtros`, só das linhas que casam com a severidade e o tipo escolhidos. */
export function contarPorSituacao(linhas: ProblemaLinha[], filtros?: FiltrosDeClassificacao): Record<SituacaoProblema, number> {
  const c: Record<SituacaoProblema, number> = { em_aberto: 0, aguardando: 0, encerrados: 0 };
  for (const l of linhas) {
    if (filtros && !casaComClassificacao(l, filtros)) continue;
    const s = situacaoDoStatus(l.status);
    if (s) c[s]++;
  }
  return c;
}

/**
 * Dica do estado vazio dos filtros: onde há problemas nas OUTRAS situações (com a mesma severidade
 * e tipo). Ex.: "Há 3 em Encerrados." · "Há 1 em Aguardando verificação e 2 em Encerrados."
 * `null` quando nenhuma outra situação tem itens.
 */
export function dicaDeOutrasSituacoes(
  contagem: Record<SituacaoProblema, number>,
  atual: SituacaoProblema,
): string | null {
  const partes = SITUACOES.filter((s) => s !== atual && contagem[s] > 0).map((s) => `${contagem[s]} em ${SITUACAO_LABEL[s]}`);
  if (partes.length === 0) return null;
  return `Há ${partes.join(" e ")}.`;
}

export function agruparPorDisciplina(
  linhas: ProblemaLinha[],
): { disciplinaId: string; disciplinaNome: string; linhas: ProblemaLinha[] }[] {
  const grupos = new Map<string, { disciplinaId: string; disciplinaNome: string; linhas: ProblemaLinha[] }>();
  for (const l of linhas) {
    const g = grupos.get(l.disciplinaId) ?? { disciplinaId: l.disciplinaId, disciplinaNome: l.disciplinaNome, linhas: [] };
    g.linhas.push(l);
    grupos.set(l.disciplinaId, g);
  }
  const lista = [...grupos.values()];
  // O número é por documento: numa disciplina com várias pranchas haveria um #1 de cada. Agrupa
  // pela prancha (nome do arquivo) e só depois pelo número.
  for (const g of lista) {
    g.linhas.sort((a, b) => a.arquivo.localeCompare(b.arquivo, "pt-BR", { numeric: true }) || a.numero - b.numero);
  }
  return lista.sort((a, b) => a.disciplinaNome.localeCompare(b.disciplinaNome, "pt-BR"));
}

const MS_DIA = 24 * 60 * 60 * 1000;

/** Dias inteiros (≥ 0) desde a criação até o encerramento — ou até `agora`, se ainda aberto. */
export function diasEmAberto(createdAt: string | Date, fechadoEm: string | Date | null, agora: Date): number {
  const ini = new Date(createdAt).getTime();
  const fim = fechadoEm ? new Date(fechadoEm).getTime() : agora.getTime();
  return Math.max(0, Math.floor((fim - ini) / MS_DIA));
}

/** Endereço do visualizador já com o alfinete aberto; `null` quando o arquivo está na lixeira. */
export function hrefDaPrancha(
  l: { arquivoDisponivel: boolean; uploadIdVigente: string | null; uploadIdOrigem: string; numero: number },
  projetoId: string,
): string | null {
  if (!l.arquivoDisponivel) return null;
  return `/projetos/${projetoId}/arquivos/${l.uploadIdVigente ?? l.uploadIdOrigem}/visualizar?pin=${l.numero}`;
}
