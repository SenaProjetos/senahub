import "server-only";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { acessoGlobal, INTERNAL_ROLES, type Role } from "@/lib/roles";
import { escopoProjeto } from "@/modules/projetos/queries";
import type { SessionUser } from "@/lib/session";

export type AncoraDocumento = { propostaId?: string | null; projetoId?: string | null };

/**
 * Projeto "efetivo" do documento: o próprio `projetoId`, ou o projeto gerado pela
 * proposta ancorada (join `Proposta.projetoId`). Null quando a proposta ainda não
 * virou projeto (fase comercial pura).
 */
async function projetoEfetivo(ancora: AncoraDocumento): Promise<string | null> {
  if (ancora.projetoId) return ancora.projetoId;
  if (ancora.propostaId) {
    const p = await prisma.proposta.findUnique({ where: { id: ancora.propostaId }, select: { projetoId: true } });
    return p?.projetoId ?? null;
  }
  return null;
}

async function veProjeto(user: SessionUser, projetoId: string): Promise<boolean> {
  if (acessoGlobal(user)) return true;
  const p = await prisma.projeto.findFirst({
    where: { AND: [{ id: projetoId }, escopoProjeto(user)] },
    select: { id: true },
  });
  return !!p;
}

/**
 * Leitura: quem enxerga o projeto efetivo do documento, ou quem tem `comercial:ver`
 * (documentos ainda na fase de proposta). Assim um membro do projeto vê os docs
 * herdados da proposta de origem.
 */
export async function podeLerDocumento(user: SessionUser, ancora: AncoraDocumento): Promise<boolean> {
  const projetoId = await projetoEfetivo(ancora);
  if (projetoId && (await veProjeto(user, projetoId))) return true;
  return can(user.role, "comercial", "ver");
}

/**
 * Escrita: perfil global; ou `comercial:gerir` (contexto de proposta); ou membro
 * interno do projeto efetivo. `cliente` não gerencia por aqui (o upload do cliente
 * é o portal/link das fases seguintes).
 */
export async function podeGerirDocumento(user: SessionUser, ancora: AncoraDocumento): Promise<boolean> {
  if (acessoGlobal(user)) return true;
  if (await can(user.role, "comercial", "gerir")) return true;
  const projetoId = await projetoEfetivo(ancora);
  if (projetoId && INTERNAL_ROLES.includes(user.role as Role) && (await veProjeto(user, projetoId))) return true;
  return false;
}
