"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { invalidatePerfil } from "@/lib/permissao-efetiva";
import type { Role } from "@/lib/roles";
import {
  criarPerfilSchema,
  editarPerfilSchema,
  idPerfilSchema,
  setPermissaoPerfilSchema,
  slugificar,
} from "@/modules/perfis/schemas";

/**
 * Criação/edição de Perfil de acesso — restrito a `admin` de propósito (`roles: ["admin"]`,
 * não `recurso`/`permissao`): é o mesmo raciocínio de `setPermissao` recusar editar o perfil
 * `admin` — quem pode criar um perfil com acesso amplo não pode ser o próprio perfil menos
 * privilegiado. RH/administrativo ATRIBUEM perfil existente ao usuário (`usuarios:gerir`,
 * módulo `usuarios`), não criam nem editam a matriz.
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (Onda C)
 */
const ADMIN_ONLY: Role[] = ["admin"];
const base = { modulo: "configuracoes", roles: ADMIN_ONLY } as const;
const rev = () => revalidatePath("/configuracoes/perfis");

/** Aviso apenas — perfis demais viram a bagunça que este motor veio substituir (feedback do conselho). */
const LIMITE_AVISO_PERFIS = 10;

export const criarPerfil = defineAction(
  { ...base, acao: "criar-perfil", entidade: "PerfilAcesso", schema: criarPerfilSchema },
  async (i) => {
    const chaveBase = slugificar(i.nome);
    if (!chaveBase) throw new ActionError("Nome inválido — use letras ou números.");

    let chave = chaveBase;
    let n = 2;
    while (await prisma.perfilAcesso.findUnique({ where: { chave }, select: { id: true } })) {
      chave = `${chaveBase}_${n++}`;
    }

    const perfil = await prisma.perfilAcesso.create({
      data: { chave, nome: i.nome, descricao: i.descricao || null, sistema: false, ativo: true },
    });
    rev();
    return { id: perfil.id, chave: perfil.chave };
  },
);

export const editarPerfil = defineAction(
  { ...base, acao: "editar-perfil", entidade: "PerfilAcesso", schema: editarPerfilSchema },
  async (i) => {
    // `chave` nunca muda aqui de propósito — é o slug estável referenciado por código/auditoria.
    await prisma.perfilAcesso.update({
      where: { id: i.id },
      data: { nome: i.nome, descricao: i.descricao || null },
    });
    rev();
    return { ok: true };
  },
);

export const alternarPerfilAtivo = defineAction(
  {
    ...base,
    acao: "alternar-perfil-ativo",
    entidade: "PerfilAcesso",
    schema: idPerfilSchema,
    capturarAntes: (i) => prisma.perfilAcesso.findUnique({ where: { id: i.id }, select: { ativo: true } }),
  },
  async (i) => {
    const atual = await prisma.perfilAcesso.findUnique({ where: { id: i.id }, select: { ativo: true } });
    if (!atual) throw new ActionError("Perfil não encontrado.");
    await prisma.perfilAcesso.update({ where: { id: i.id }, data: { ativo: !atual.ativo } });
    invalidatePerfil(i.id);
    rev();
    return { ativo: !atual.ativo };
  },
);

export const excluirPerfil = defineAction(
  { ...base, acao: "excluir-perfil", entidade: "PerfilAcesso", schema: idPerfilSchema },
  async (i) => {
    const perfil = await prisma.perfilAcesso.findUnique({
      where: { id: i.id },
      include: { _count: { select: { usuarios: true } } },
    });
    if (!perfil) throw new ActionError("Perfil não encontrado.");
    if (perfil.sistema) throw new ActionError("Perfis semente do sistema não podem ser excluídos — desative-o.");
    if (perfil._count.usuarios > 0) {
      throw new ActionError(`${perfil._count.usuarios} usuário(s) ainda usam este perfil — reatribua antes de excluir.`);
    }
    await prisma.perfilAcesso.delete({ where: { id: i.id } });
    invalidatePerfil(i.id);
    rev();
    return { ok: true };
  },
);

export const setPermissaoPerfil = defineAction(
  { ...base, acao: "set-permissao-perfil", entidade: "PermissaoPerfil", schema: setPermissaoPerfilSchema },
  async (i) => {
    await prisma.permissaoPerfil.upsert({
      where: { perfilId_recurso_acao: { perfilId: i.perfilId, recurso: i.recurso, acao: i.acao } },
      create: { perfilId: i.perfilId, recurso: i.recurso, acao: i.acao, permitido: i.permitido },
      update: { permitido: i.permitido },
    });
    invalidatePerfil(i.perfilId);
    revalidatePath(`/configuracoes/perfis/${i.perfilId}`);
    return { ok: true };
  },
);

export { LIMITE_AVISO_PERFIS };
