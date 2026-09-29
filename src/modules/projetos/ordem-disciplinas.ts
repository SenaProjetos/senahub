/**
 * Ordem, filtro e contagem da página Disciplinas (regra pura). O kanban saiu da página
 * (2026-09-29); quem dá a visão por status agora é a ORDEM dos cards e o filtro no topo.
 *
 * Ordem decidida pelo dono: primeiro o que pede ação — Aguardando → Em revisão → Em andamento →
 * Entregue → Aprovado — e, dentro de cada status, o prazo mais próximo primeiro. Disciplina sem
 * prazo vai para o fim do seu grupo; empate desfaz pelo nome, para a ordem não pular entre cargas.
 */
import type { StatusDisciplina } from "@/generated/prisma/client";
import { normalizar } from "@/lib/disciplinas-core";

export const ORDEM_STATUS_DISCIPLINA: StatusDisciplina[] = ["aguardando", "em_revisao", "em_andamento", "entregue", "aprovado"];

type ParaOrdenar = { status: StatusDisciplina; prazo: string | null; nome: string };

export function ordenarDisciplinas<T extends ParaOrdenar>(lista: readonly T[]): T[] {
  const pos = (s: StatusDisciplina) => {
    const i = ORDEM_STATUS_DISCIPLINA.indexOf(s);
    return i === -1 ? ORDEM_STATUS_DISCIPLINA.length : i;
  };
  return [...lista].sort((a, b) => {
    const porStatus = pos(a.status) - pos(b.status);
    if (porStatus !== 0) return porStatus;
    if (a.prazo !== b.prazo) {
      if (a.prazo === null) return 1;
      if (b.prazo === null) return -1;
      return a.prazo < b.prazo ? -1 : 1;
    }
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/** Valor do filtro vindo da URL: status conhecido, ou nenhum. */
export function statusDoFiltro(v: string | null | undefined): StatusDisciplina | null {
  return (ORDEM_STATUS_DISCIPLINA as string[]).includes(v ?? "") ? (v as StatusDisciplina) : null;
}

type ParaFiltrar = { status: StatusDisciplina; nome: string; catalogoNome?: string | null; responsaveis: { name: string }[] };

/** Busca por nome, nome no catálogo ou responsável — sem acento e sem caixa. */
export function filtrarDisciplinas<T extends ParaFiltrar>(lista: readonly T[], filtro: { status: StatusDisciplina | null; q: string }): T[] {
  const termo = normalizar(filtro.q.trim());
  return lista.filter((d) => {
    if (filtro.status && d.status !== filtro.status) return false;
    if (!termo) return true;
    return (
      normalizar(d.nome).includes(termo) ||
      normalizar(d.catalogoNome ?? "").includes(termo) ||
      d.responsaveis.some((r) => normalizar(r.name).includes(termo))
    );
  });
}

/** Quantas disciplinas em cada status (o filtro mostra o número ao lado de cada um). */
export function contarPorStatus(lista: readonly { status: StatusDisciplina }[]): Record<StatusDisciplina, number> {
  const conta = Object.fromEntries(ORDEM_STATUS_DISCIPLINA.map((s) => [s, 0])) as Record<StatusDisciplina, number>;
  for (const d of lista) conta[d.status] = (conta[d.status] ?? 0) + 1;
  return conta;
}
