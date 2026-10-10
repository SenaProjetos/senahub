/**
 * Perfis semente (Onda B da separação Setor × Contratação × Perfil de acesso).
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§8, Onda B)
 *
 * Espelha um `PerfilAcesso` + `PermissaoPerfil[]` por papel a partir de `PERMISSOES_BASE`
 * (`src/lib/permissoes-base.ts`). Até a Onda F lia a tabela `Permissao`, que só repetia a
 * constante; a tabela saiu e a constante é a fonte única (bloco F1).
 *
 * Um perfil por ROLE ATUAL (não por função): `clt` e `projetista_pj` fazem hoje a mesma
 * função de projetista, mas têm matrizes DIFERENTES na semente (ex.: só `clt` tem
 * `arquivos:ver_todas_disciplinas`) — consolidar os dois num único perfil "Projetista" agora
 * quebraria o espelho fiel que esta onda promete. Essa consolidação é o objetivo de fundo da
 * reforma inteira, mas é uma decisão CONSCIENTE de reconciliar as diferenças, não algo pra
 * automatizar silenciosamente aqui.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { PERMISSOES_BASE } from "@/lib/permissoes-base";
import { CHAVE_POR_ROLE, NOME_POR_ROLE, PAPEIS_SEMENTE, type PapelSemente } from "@/modules/usuarios/vinculo/perfil-semente";

export { CHAVE_POR_ROLE };

export type ResultadoSeedPerfis = {
  /** `semeado: false` = o perfil já existia e a matriz dele foi preservada. */
  perfis: { role: PapelSemente; chave: string; perfilId: string; linhas: number; semeado: boolean }[];
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

  for (const role of PAPEIS_SEMENTE) {
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

    const linhas = PERMISSOES_BASE.filter((p) => p.role === role).map((p) => ({
      perfilId: perfil.id,
      recurso: p.recurso,
      acao: p.acao,
      permitido: true,
    }));

    // Escopo de dados (`escopo:global`, sintético — não está em `PERMISSOES_BASE`, por isso
    // não vem da semente acima): só o Coordenador recebe. Histórico da decisão, porque ela já mudou uma vez:
    //   - 2026-07-28 (§9.7): NENHUM perfil semente recebia — a empresa ia para gestores por setor.
    //   - 2026-09-04: revogada pelo dono — "Coordenador é geral, vê todos os projetos"; a
    //     subdivisão por disciplina vem depois e vai RESTRINGIR este escopo, não ampliar.
    // Bancos que já existiam receberam o par pela migration
    // `20260915140000_perfil_coordenador_escopo_global` (este seed é create-only).
    // Não é só leitura: `acessoGlobal()` também libera anexar em apontamento e gerir documento do
    // cliente de qualquer projeto. Validar/renomear/excluir e editar em disciplina alheia continuam
    // no papel (`GLOBAL_ROLES`).
    if (chave === CHAVE_POR_ROLE.supervisor) {
      linhas.push({ perfilId: perfil.id, recurso: "escopo", acao: "global", permitido: true });
    }

    if (linhas.length) await prisma.permissaoPerfil.createMany({ data: linhas });

    resultado.perfis.push({ role, chave, perfilId: perfil.id, linhas: linhas.length, semeado: true });
  }

  return resultado;
}
