import "server-only";
import { prisma } from "@/lib/prisma";
import type { StatusDisciplina } from "@/generated/prisma/client";

const PESO: Record<StatusDisciplina, number> = {
  aguardando: 0,
  em_andamento: 0.4,
  em_revisao: 0.6,
  entregue: 0.85,
  aprovado: 1,
};

function progresso(ds: { status: StatusDisciplina }[]): number {
  if (ds.length === 0) return 0;
  return Math.round((ds.reduce((s, d) => s + PESO[d.status], 0) / ds.length) * 100);
}

/** Projetos do cliente (read-only). Escopo ESTRITO por clienteId do próprio usuário. */
export async function projetosDoCliente(clienteId: string) {
  const projetos = await prisma.projeto.findMany({
    where: { clienteId },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: {
      id: true,
      codigo: true,
      nome: true,
      situacao: true,
      prazoFinal: true,
      disciplinas: { select: { status: true } },
    },
  });
  return projetos.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    situacao: p.situacao,
    prazoFinal: p.prazoFinal ? p.prazoFinal.toISOString().slice(0, 10) : null,
    totalDisciplinas: p.disciplinas.length,
    progresso: progresso(p.disciplinas),
  }));
}

/** Detalhe read-only de um projeto — só retorna se pertencer ao cliente. */
export async function projetoDoCliente(clienteId: string, projetoId: string) {
  const p = await prisma.projeto.findFirst({
    where: { id: projetoId, clienteId },
    select: {
      id: true,
      codigo: true,
      nome: true,
      situacao: true,
      prazoFinal: true,
      endereco: true,
      disciplinas: {
        orderBy: { ordem: "asc" },
        select: { id: true, nome: true, status: true, prazo: true },
      },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    situacao: p.situacao,
    endereco: p.endereco,
    prazoFinal: p.prazoFinal ? p.prazoFinal.toISOString().slice(0, 10) : null,
    progresso: progresso(p.disciplinas),
    disciplinas: p.disciplinas.map((d) => ({
      id: d.id,
      nome: d.nome,
      status: d.status,
      prazo: d.prazo ? d.prazo.toISOString().slice(0, 10) : null,
    })),
  };
}
