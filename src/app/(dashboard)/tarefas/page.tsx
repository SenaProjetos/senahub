import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { INTERNAL_ROLES } from "@/lib/roles";
import { quadroTarefas, opcoesTarefa, tarefaBloqueada } from "@/modules/tarefas/queries";
import { TarefasBoard } from "@/components/tarefas/tarefas-board";

export const metadata: Metadata = { title: "Tarefas" };

export default async function TarefasPage() {
  const user = await requireRole(...INTERNAL_ROLES);
  const [colunas, opcoes] = await Promise.all([quadroTarefas(), opcoesTarefa()]);

  return (
    <TarefasBoard
      meId={user.id}
      meRole={user.role}
      opcoes={opcoes}
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
          criadorId: t.criadorId,
          responsaveis: t.responsaveis.map((r) => ({ id: r.user.id, nome: r.user.name })),
          itens: t.itens.map((it) => ({ id: it.id, descricao: it.descricao, concluido: it.concluido })),
          dependeDeIds: t.dependeDe.map((d) => d.dependeDe.id),
          bloqueada: tarefaBloqueada(t),
          comentarios: t.comentarios.map((c) => ({
            id: c.id,
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
