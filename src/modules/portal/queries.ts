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

/**
 * Cliente vinculado ao usuário do portal. `ativo = false` = cliente desativado no cadastro: o portal inteiro
 * fica fechado para ele, mesmo com a conta de usuário ativa (decisão do dono, 2026-11-18).
 */
export async function clienteDoUsuario(userId: string): Promise<{ clienteId: string; ativo: boolean } | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { clienteId: true, cliente: { select: { ativo: true } } },
  });
  if (!u?.clienteId) return null;
  return { clienteId: u.clienteId, ativo: u.cliente?.ativo ?? false };
}

/** Projetos do cliente (read-only). Escopo ESTRITO por clienteId do próprio usuário; cliente desativado não vê nada. */
export async function projetosDoCliente(clienteId: string) {
  const projetos = await prisma.projeto.findMany({
    where: { clienteId, cliente: { ativo: true } },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: {
      id: true,
      codigo: true,
      nome: true,
      situacao: true,
      prazoContrato: true,
      disciplinas: { select: { status: true } },
    },
  });
  return projetos.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    situacao: p.situacao,
    prazoContrato: p.prazoContrato ? p.prazoContrato.toISOString().slice(0, 10) : null,
    totalDisciplinas: p.disciplinas.length,
    progresso: progresso(p.disciplinas),
  }));
}

/** Detalhe read-only de um projeto — só retorna se pertencer ao cliente, e com o cliente ativo. */
export async function projetoDoCliente(clienteId: string, projetoId: string) {
  const p = await prisma.projeto.findFirst({
    where: { id: projetoId, clienteId, cliente: { ativo: true } },
    select: {
      id: true,
      codigo: true,
      nome: true,
      situacao: true,
      prazoContrato: true,
      endereco: true,
      disciplinas: {
        orderBy: { ordem: "asc" },
        select: { id: true, disciplinaTextoLegado: true, status: true, prazo: true },
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
    prazoContrato: p.prazoContrato ? p.prazoContrato.toISOString().slice(0, 10) : null,
    progresso: progresso(p.disciplinas),
    disciplinas: p.disciplinas.map((d) => ({
      id: d.id,
      nome: d.disciplinaTextoLegado,
      status: d.status,
      prazo: d.prazo ? d.prazo.toISOString().slice(0, 10) : null,
    })),
  };
}
