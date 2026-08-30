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

/**
 * Perfis para o seletor da tela de Usuários. Traz `escopoGlobal` porque a tela precisa dizer,
 * ANTES de salvar, se aquele perfil faz a pessoa enxergar todos os projetos — `acessoGlobal()` é
 * `superUsuario ||` esta permissão sintética, e nenhum perfil semente a tem (§9.7). Sem isso a
 * tela só poderia chutar, e chutar sobre escopo de dados é como se perde acesso sem ninguém ver.
 */
export async function perfisAtivosParaSelect() {
  const perfis = await prisma.perfilAcesso.findMany({
    where: { ativo: true },
    select: {
      id: true,
      nome: true,
      chave: true,
      // Mesmo par literal que `lib/session.ts` usa para calcular `escopoGlobalPerfil` — não há
      // constante compartilhada, então renomear no catálogo tem que mudar os dois. O teste
      // `resumo-acesso.test.ts` guarda o par contra `PERMISSOES_CATALOGO`: se sumir dali, quebra
      // vermelho em vez de a tela passar a dizer "só os próprios projetos" para quem vê tudo.
      permissoes: {
        where: { recurso: "escopo", acao: "global", permitido: true },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { nome: "asc" },
  });
  return perfis.map(({ permissoes, ...p }) => ({ ...p, escopoGlobal: permissoes.length > 0 }));
}
