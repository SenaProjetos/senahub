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
import { ROLES, type Role } from "@/lib/roles";
import { CHAVE_POR_ROLE, NOME_POR_ROLE } from "@/modules/usuarios/vinculo/perfil-semente";

export { CHAVE_POR_ROLE };

export type ResultadoSeedPerfis = {
  /** `semeado: false` = o perfil já existia e a matriz dele foi preservada. */
  perfis: { role: Role; chave: string; perfilId: string; linhas: number; semeado: boolean }[];
};

/**
 * Idempotente e **create-only na matriz** (decisão do dono, 2026-09-02 — §5-A de
 * docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md).
 *
 * Até 2026-09-02 esta função fazia `deleteMany` + `createMany` a cada execução, "para o espelho
 * refletir retiradas". O efeito colateral era pior que o problema: **todo `db:seed` do deploy
 * apagava o que tivesse sido configurado em `/configuracoes/perfis`**. Pior, de forma
 * assimétrica — revogar sobrevivia (o `upsert` de `PERMISSOES_BASE` não mexe em linha
 * existente), conceder morria. Configuração que evapora no deploy, sem erro e sem log.
 *
 * Agora a matriz é escrita **só quando o perfil é criado**. `PERMISSOES_BASE` volta a ser o que
 * sempre deveria ter sido: ponto de partida de banco novo, não verdade reimposta a cada deploy.
 *
 * O PREÇO, que é real e precisa ser pago à mão: par de permissão novo **não se distribui
 * sozinho** aos perfis que já existem. Quem adiciona um par ao catálogo tem que escrever a
 * migration de dados que o concede a quem já tem o par equivalente — ver
 * `20260902120000_perfis_tarefas_ver` como modelo. Sem isso, o par nasce negado para todo mundo
 * e alguém perde acesso silenciosamente.
 *
 * O metadado do perfil (`nome`, `sistema`) continua sincronizando a cada execução: é rótulo,
 * não autorização. Overrides individuais (`PermissaoUsuario`) nunca foram tocados aqui.
 */
export async function seedPerfisAcesso(prisma: PrismaClient): Promise<ResultadoSeedPerfis> {
  const resultado: ResultadoSeedPerfis = { perfis: [] };

  for (const role of ROLES) {
    const chave = CHAVE_POR_ROLE[role];
    if (!chave) continue; // admin

    // Existia ANTES desta execução? É o que decide se a matriz é semeada. Precisa ser lido
    // antes do `upsert` — depois dele, todo perfil "existe" e a distinção some.
    const existente = await prisma.perfilAcesso.findUnique({ where: { chave }, select: { id: true } });

    const perfil = await prisma.perfilAcesso.upsert({
      where: { chave },
      create: { chave, nome: NOME_POR_ROLE[role] ?? role, sistema: true, ativo: true },
      update: { nome: NOME_POR_ROLE[role] ?? role, sistema: true },
    });

    if (existente) {
      // Perfil já existia: a matriz dele é do dono, não da semente. Não tocar.
      const linhasAtuais = await prisma.permissaoPerfil.count({ where: { perfilId: perfil.id } });
      resultado.perfis.push({ role, chave, perfilId: perfil.id, linhas: linhasAtuais, semeado: false });
      continue;
    }

    const linhasLegado = await prisma.permissao.findMany({
      where: { role },
      select: { recurso: true, acao: true, permitido: true },
    });

    const linhas = linhasLegado
      .filter((l) => l.permitido)
      .map((l) => ({ perfilId: perfil.id, recurso: l.recurso, acao: l.acao, permitido: true }));

    // Escopo de dados (`escopo:global`, sintético — não passa por `Permissao`): NENHUM perfil
    // semente recebe automaticamente. Decisão do dono (2026-07-28, §9.7): Coordenador NÃO
    // mantém o escopo global que `supervisor` tem hoje via `GLOBAL_ROLES` — a empresa está
    // migrando para gestores por setor, e "todo coordenador vê todo projeto da empresa" não
    // serve mais esse desenho. Continua inerte até a Onda D religar `acessoGlobal()` (hoje
    // ainda lê `GLOBAL_ROLES`, código, sem mudança de comportamento real por este seed). Um
    // futuro perfil "gestor de setor" que precise de escopo mais amplo que um projeto (mas
    // não necessariamente global) é desenho novo, não este par binário — feito quando existir.

    if (linhas.length) await prisma.permissaoPerfil.createMany({ data: linhas });

    resultado.perfis.push({ role, chave, perfilId: perfil.id, linhas: linhas.length, semeado: true });
  }

  return resultado;
}
