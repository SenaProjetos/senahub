/**
 * Perfis semente (Onda B da separação Setor × Contratação × Perfil de acesso).
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§8, Onda B)
 *
 * Lê a tabela `Permissao` (legado, já semeada por `db:seed`) e espelha um `PerfilAcesso` +
 * `PermissaoPerfil[]` por role — em vez de importar `PERMISSOES_BASE` de `prisma/seed.ts`.
 * Duas razões: (1) evita editar de novo um arquivo com trabalho concorrente de outro módulo
 * (Engenharia de Custos) misturado; (2) o espelho fica automaticamente correto mesmo que
 * OUTRO módulo adicione linhas a `PERMISSOES_BASE` depois — lê o estado real da tabela, não
 * uma constante que pode ficar desatualizada.
 *
 * Um perfil por ROLE ATUAL (não por função): `clt` e `projetista_pj` fazem hoje a mesma
 * função de projetista, mas têm matrizes DIFERENTES em `Permissao` (ex.: só `clt` tem
 * `arquivos:ver_todas_disciplinas`) — consolidar os dois num único perfil "Projetista" agora
 * quebraria o espelho fiel que esta onda promete. Essa consolidação é o objetivo de fundo da
 * reforma inteira, mas é uma decisão CONSCIENTE de reconciliar as diferenças, não algo pra
 * automatizar silenciosamente aqui.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { GLOBAL_ROLES, ROLES, type Role } from "@/lib/roles";
import { CHAVE_POR_ROLE, NOME_POR_ROLE } from "@/modules/usuarios/vinculo/perfil-semente";

export { CHAVE_POR_ROLE };

export type ResultadoSeedPerfis = {
  perfis: { role: Role; chave: string; perfilId: string; linhas: number }[];
};

/**
 * Idempotente: `upsert` em `chave` para o perfil, e regrava a matriz inteira do perfil a
 * partir do legado a cada execução (delete + createMany) — assim, se uma permissão for
 * retirada de um role em `Permissao`, o espelho reflete a retirada no próximo `db:seed`,
 * em vez de acumular permissão morta. Overrides individuais (`PermissaoUsuario`) não são
 * tocados por esta função.
 */
export async function seedPerfisAcesso(prisma: PrismaClient): Promise<ResultadoSeedPerfis> {
  const resultado: ResultadoSeedPerfis = { perfis: [] };

  for (const role of ROLES) {
    const chave = CHAVE_POR_ROLE[role];
    if (!chave) continue; // admin

    const linhasLegado = await prisma.permissao.findMany({
      where: { role },
      select: { recurso: true, acao: true, permitido: true },
    });

    const perfil = await prisma.perfilAcesso.upsert({
      where: { chave },
      create: { chave, nome: NOME_POR_ROLE[role] ?? role, sistema: true, ativo: true },
      update: { nome: NOME_POR_ROLE[role] ?? role, sistema: true },
    });

    const linhas = linhasLegado
      .filter((l) => l.permitido)
      .map((l) => ({ perfilId: perfil.id, recurso: l.recurso, acao: l.acao, permitido: true }));

    // Escopo de dados: hoje é código puro (`GLOBAL_ROLES`), não passa por `Permissao`.
    // Espelha aqui como par sintético `escopo:global` — inerte até a Onda D religar
    // `acessoGlobal()` em cima do motor novo (ver lib/session.ts).
    if (GLOBAL_ROLES.includes(role)) {
      linhas.push({ perfilId: perfil.id, recurso: "escopo", acao: "global", permitido: true });
    }

    await prisma.$transaction([
      prisma.permissaoPerfil.deleteMany({ where: { perfilId: perfil.id } }),
      ...(linhas.length ? [prisma.permissaoPerfil.createMany({ data: linhas })] : []),
    ]);

    resultado.perfis.push({ role, chave, perfilId: perfil.id, linhas: linhas.length });
  }

  return resultado;
}
