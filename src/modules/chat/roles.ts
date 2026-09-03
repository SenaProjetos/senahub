/**
 * Só resta um conjunto de papéis no chat, e é escopo de DADOS, não de tela.
 *
 * `CHAT_ROLES`, `DM_ROLES_EXCLUIDAS` e `ChatRole` saíram na F3 (2026-09-02): quem participa do
 * chat, quem entra no `#geral`, quem abre DM e quem cria grupo viraram permissões configuráveis
 * (`chat:usar`, `chat:geral`, `chat:dm`, `chat:grupo`) — ver
 * docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md.
 */

/**
 * Perfis visíveis globalmente em todos os canais de projeto/disciplina — entram como membro
 * mesmo sem estar no projeto. É escopo de dados ("enxerga todos os projetos"), o mesmo eixo de
 * `escopo:global`, e não um gate de tela. Migra na F5 junto com as outras audiências de acesso.
 */
export const ROLES_GLOBAIS_CHAT = ["admin", "supervisor"] as const;
