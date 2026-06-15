import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listarClientes } from "@/modules/clientes/queries";
import { LicitacoesView } from "@/components/licitacoes/licitacoes-view";

export const metadata: Metadata = { title: "Licitações" };

export default async function LicitacoesPage() {
  const user = await requirePermission("licitacoes", "ver");
  const podeGerir = await can(user.role, "licitacoes", "gerir");

  const [licitacoes, clientes] = await Promise.all([
    prisma.licitacao.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        projeto: { select: { id: true, codigo: true } },
        docs: {
          include: { versoes: { orderBy: { numero: "desc" } } },
        },
        medicoes: { orderBy: { numero: "asc" } },
        historico: { orderBy: { createdAt: "desc" }, take: 20 },
        valoresDisciplina: { orderBy: { disciplina: "asc" } },
      },
    }),
    listarClientes({ incluirInativos: false }),
  ]);

  return (
    <LicitacoesView
      podeGerir={podeGerir}
      clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
      licitacoes={licitacoes.map((l) => ({
        id: l.id,
        titulo: l.titulo,
        orgao: l.orgao,
        modalidade: l.modalidade,
        numeroEdital: l.numeroEdital,
        prazoProposta: l.prazoProposta ? l.prazoProposta.toISOString().slice(0, 10) : "",
        valorEstimado: l.valorEstimado != null ? Number(l.valorEstimado) : null,
        status: l.status,
        observacoes: l.observacoes ?? "",
        projeto: l.projeto ? { id: l.projeto.id, codigo: l.projeto.codigo } : null,
        docs: l.docs.map((d) => ({
          id: d.id,
          titulo: d.titulo,
          versoes: d.versoes.map((v) => ({ id: v.id, numero: v.numero, arquivoNome: v.arquivoNome })),
        })),
        medicoes: l.medicoes.map((m) => ({
          id: m.id,
          numero: m.numero,
          valor: Number(m.valor),
          data: m.data.toISOString().slice(0, 10),
        })),
        historico: l.historico.map((h) => ({ id: h.id, descricao: h.descricao, data: h.createdAt.toISOString() })),
        valoresDisciplina: l.valoresDisciplina.map((v) => ({ id: v.id, disciplina: v.disciplina, valor: Number(v.valor) })),
      }))}
    />
  );
}
