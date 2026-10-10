/**
 * Escopo de dados. O papel legado (`Role`, 9 valores, e os grupos `HR_ADMIN_ROLES`, `CLT_ROLES`,
 * `PJ_ROLES`...) saiu na Onda F: acesso é Perfil de acesso + `superUsuario` (+ permissões dadas
 * pessoa a pessoa), interno × externo é `User.tipo`, e jornada/NF/pagamento seguem a contratação
 * (`lib/contratacao.ts`). Sobrou aqui só a regra de escopo de dados.
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§16)
 */

/**
 * Acesso GLOBAL de LEITURA: enxerga todos os projetos da empresa, não só aqueles em que a pessoa
 * é membro ou responsável. É **escopo de dados**, não permissão de tela — alimenta
 * `escopoProjeto()` e os 27 gates de download/relatório que dependem dele.
 *
 * Desde a Onda D resolve por `superUsuario` (o bypass do motor) ou pela permissão sintética
 * `escopo:global` do Perfil de acesso, já calculada uma vez por request em `getSession()`. Antes
 * era `role === "admin" || GLOBAL_ROLES.includes(role) || ehSocio` — três regras em código, fora
 * da tela de Permissões e fora do arnês de equivalência.
 *
 * Duas mudanças reais vieram com isso, ambas decididas e medidas:
 *   - o **Coordenador perde** o escopo global (§9.7/§14.9 — a empresa vai para gestores por setor,
 *     não uma coordenação que vê tudo);
 *   - o **sócio mantém**, mas por override nominal e auditável (§15.15), não por `if (ehSocio)`.
 */
export function acessoGlobal(u: EscopoDeDados): boolean {
  return u.superUsuario === true || u.escopoGlobalPerfil === true;
}

/**
 * O que basta para decidir escopo de dados. Os dois campos são **obrigatórios de propósito**:
 * opcionais fariam um viewer parcial (`{ id, role }`) compilar e resolver `false` em silêncio —
 * fail-closed, mas silencioso, que é como se perde acesso sem ninguém perceber. Exigindo-os, o
 * compilador aponta cada lugar que precisa carregar o dado da sessão.
 */
export type EscopoDeDados = {
  superUsuario: boolean;
  escopoGlobalPerfil: boolean;
  /** Interno × externo: externo vê só os projetos do próprio cliente (`escopoProjeto`). Onda F, bloco C. */
  tipo: "interno" | "externo";
};
