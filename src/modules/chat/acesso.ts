/**
 * Quem pode LER um canal do qual não é membro (modo observador, somente leitura).
 *
 * Regra única — toda leitura fora da membresia (lista de moderação, mensagens, anexos,
 * encaminhar, room do socket) passa por aqui, para que o espaço de Anotações não vaze por
 * um caminho esquecido:
 * - `admin` observa qualquer canal, inclusive as Anotações de cada usuário;
 * - `supervisor` observa todos os canais, **exceto** Anotações;
 * - os demais só leem canais de que participam.
 *
 * O Termo de Uso dos colaboradores (cláusula 4.2) declara exatamente isto — mudar a regra
 * aqui exige atualizar o termo e incrementar a versão em `modules/legal/termos.ts`.
 *
 * Módulo puro (sem `server-only`): testado e reaproveitável por rota, socket e query.
 */

/** Tipos de canal que aparecem na lista "Moderação" do observador (os demais já o incluem como membro). */
const TIPOS_MODERACAO = ["grupo", "dm", "socios", "anotacoes"] as const;

export function podeObservarCanal(role: string | null | undefined, tipoCanal: string): boolean {
  if (role === "admin") return true;
  if (role === "supervisor") return tipoCanal !== "anotacoes";
  return false;
}

/**
 * Quem pode EDITAR/EXCLUIR mensagem alheia no canal (moderação). Hoje coincide com
 * `podeObservarCanal`, mas é função separada de propósito: ampliar quem LÊ (ex.: sócio) não
 * pode, por tabela, dar a ninguém o poder de apagar mensagens.
 */
export function podeModerarCanal(role: string | null | undefined, tipoCanal: string): boolean {
  if (role === "admin") return true;
  if (role === "supervisor") return tipoCanal !== "anotacoes";
  return false;
}

/** Tipos de canal que `role` enxerga na lista de moderação (vazio = não observa nada). */
export function tiposModeracao(role: string | null | undefined): string[] {
  return TIPOS_MODERACAO.filter((t) => podeObservarCanal(role, t));
}
