import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { INTERNAL_ROLES } from "@/lib/roles";
import { quadroTarefas, opcoesTarefa, tarefaBloqueada, type FiltrosQuadroTarefas } from "@/modules/tarefas/queries";
import { hrefsApontamentoPorItem } from "@/modules/coordenacao/queries";
import { TarefasBoard } from "@/components/tarefas/tarefas-board";
import { pageCount, parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Tarefas" };

type SP = {
  q?: string;
  projeto?: string;
  disciplina?: string;
  responsavel?: string;
  periodo?: string;
  prioridade?: string;
  page?: string;
  pageSize?: string;
};

export default async function TarefasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireRole(...INTERNAL_ROLES);
  const sp = await searchParams;
  const { page, pageSize, skip, take, q } = parseListParams(sp, {
    sortFields: [],
    defaultPageSize: 24,
  });
  const periodo = ["atrasadas", "semana", "mes"].includes(sp.periodo ?? "")
    ? (sp.periodo as FiltrosQuadroTarefas["periodo"])
    : undefined;
  const filtros: FiltrosQuadroTarefas = {
    q,
    projetoId: sp.projeto,
    disciplinaId: sp.disciplina,
    responsavelId: sp.responsavel,
    prioridade: sp.prioridade,
    periodo,
  };
  const [quadro, opcoes] = await Promise.all([
    quadroTarefas(user, filtros, { skip, take }),
    opcoesTarefa(user),
  ]);
  const { colunas } = quadro;

  // Atalho "ver no 3D" nos itens de checklist gerados por apontamentos de coordenação.
  const itemIds = colunas.flatMap((c) => c.tarefas.flatMap((t) => t.itens.map((it) => it.id)));
  const hrefApontamento = await hrefsApontamentoPorItem(itemIds);

  return (
    <TarefasBoard
      meId={user.id}
      meRole={user.role}
      opcoes={opcoes}
      page={page}
      pageCount={pageCount(quadro.total, pageSize)}
      pageSize={pageSize}
      total={quadro.total}
      colunas={colunas.map((c) => ({
        id: c.id,
        nome: c.nome,
        cor: c.cor,
        concluido: c.concluido,
        tarefas: c.tarefas.map((t) => ({
          id: t.id,
          titulo: t.titulo,
          descricao: t.descricao ?? "",
          statusId: t.statusId,
          prazo: t.prazo ? t.prazo.toISOString().slice(0, 10) : "",
          prioridade: t.prioridade ?? "",
          projetoId: t.projetoId ?? "",
          projetoCodigo: t.projeto?.codigo ?? null,
          projetoNome: t.projeto?.nome ?? null,
          disciplinaId: t.disciplinaId ?? "",
          criadorId: t.criadorId,
          responsaveis: t.responsaveis.map((r) => ({ id: r.user.id, nome: r.user.name })),
          itens: t.itens.map((it) => ({
            id: it.id,
            descricao: it.descricao,
            concluido: it.concluido,
            apontamentoHref: hrefApontamento.get(it.id),
          })),
          dependeDeIds: t.dependeDe.map((d) => d.dependeDe.id),
          bloqueada: tarefaBloqueada(t),
          comentarios: t.comentarios.map((c) => ({
            id: c.id,
            autorId: c.autorId,
            texto: c.texto,
            autor: c.autor.name,
            data: c.createdAt.toISOString(),
            anexoMime: c.anexoMime,
            anexoNome: c.anexoNome,
          })),
        })),
      }))}
    />
  );
}
