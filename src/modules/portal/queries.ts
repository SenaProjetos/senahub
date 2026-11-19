import "server-only";
import { prisma } from "@/lib/prisma";
import { progressoDoPortal } from "./andamento-queries";

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

/**
 * Projetos do cliente (read-only). Escopo ESTRITO por clienteId do próprio usuário; cliente desativado não vê nada.
 * O progresso é o MESMO do detalhe (`progressoDoPortal` = `andamentoDoPortal` sem datas): fases concluídas para o
 * cliente, não o status interno.
 */
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
      _count: { select: { disciplinas: true } },
    },
  });
  const itens = [];
  // Um por vez: cada um lê as Entregas do projeto, e clientes têm poucos projetos.
  for (const p of projetos) {
    itens.push({
      id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      situacao: p.situacao,
      prazoContrato: p.prazoContrato ? p.prazoContrato.toISOString().slice(0, 10) : null,
      totalDisciplinas: p._count.disciplinas,
      progresso: await progressoDoPortal(p),
    });
  }
  return itens;
}

/** Detalhe read-only de um projeto — só retorna se pertencer ao cliente, e com o cliente ativo. */
export async function projetoDoCliente(clienteId: string, projetoId: string) {
  const p = await prisma.projeto.findFirst({
    where: { id: projetoId, clienteId, cliente: { ativo: true } },
    select: { id: true, codigo: true, nome: true, situacao: true, prazoContrato: true, endereco: true },
  });
  if (!p) return null;
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    situacao: p.situacao,
    endereco: p.endereco,
    prazoContrato: p.prazoContrato ? p.prazoContrato.toISOString().slice(0, 10) : null,
  };
}
