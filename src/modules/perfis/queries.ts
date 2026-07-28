import "server-only";
import { prisma } from "@/lib/prisma";
import { PERMISSOES_CATALOGO } from "@/lib/permissions-catalog";

export async function listarPerfis() {
  const perfis = await prisma.perfilAcesso.findMany({
    orderBy: [{ sistema: "desc" }, { nome: "asc" }],
    include: { _count: { select: { usuarios: true, permissoes: true } } },
  });
  return perfis.map((p) => ({
    id: p.id,
    chave: p.chave,
    nome: p.nome,
    descricao: p.descricao,
    sistema: p.sistema,
    ativo: p.ativo,
    usuariosCount: p._count.usuarios,
    permissoesCount: p._count.permissoes,
  }));
}

/** Matriz recurso:ação → permitido de UM perfil, mesclada com o catálogo (default false). */
export async function perfilComMatriz(id: string) {
  const perfil = await prisma.perfilAcesso.findUnique({ where: { id } });
  if (!perfil) return null;

  const linhas = await prisma.permissaoPerfil.findMany({ where: { perfilId: id } });
  const byKey = new Map(linhas.map((l) => [`${l.recurso}:${l.acao}`, l.permitido]));

  const matriz: Record<string, boolean> = {};
  for (const rec of PERMISSOES_CATALOGO) {
    for (const a of rec.acoes) {
      const key = `${rec.recurso}:${a.acao}`;
      matriz[key] = byKey.get(key) ?? false;
    }
  }

  return {
    id: perfil.id,
    chave: perfil.chave,
    nome: perfil.nome,
    descricao: perfil.descricao,
    sistema: perfil.sistema,
    ativo: perfil.ativo,
    matriz,
  };
}

export async function overridesDeUsuario(userId: string) {
  const rows = await prisma.permissaoUsuario.findMany({
    where: { userId },
    orderBy: { criadoEm: "desc" },
    include: { concedidoPor: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    recurso: r.recurso,
    acao: r.acao,
    permitido: r.permitido,
    motivo: r.motivo,
    expiraEm: r.expiraEm,
    criadoEm: r.criadoEm,
    concedidoPorNome: r.concedidoPor?.name ?? null,
    expirado: r.expiraEm ? r.expiraEm.getTime() < Date.now() : false,
  }));
}

export async function perfisAtivosParaSelect() {
  return prisma.perfilAcesso.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, chave: true },
    orderBy: { nome: "asc" },
  });
}
