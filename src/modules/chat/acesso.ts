/**
 * Quem pode LER um canal do qual não é membro (modo observador, somente leitura).
 *
 * Regra única — toda leitura fora da membresia (lista de moderação, mensagens, anexos,
 * encaminhar, room do socket) passa por aqui, para que o espaço de Anotações não vaze por
 * um caminho esquecido:
 * - **superusuário** observa qualquer canal, inclusive as Anotações de cada usuário;
 * - quem tem **`chat:moderar`** observa todos os canais, **exceto** Anotações;
 * - os demais só leem canais de que participam.
 *
 * Até a Onda F a regra era por papel (`admin` / `supervisor`). Decisão do dono (§16.4): virou
 * superusuário + permissão dada pessoa a pessoa. O Termo de Uso dos colaboradores (cláusula 4.2)
 * declara exatamente isto — mudar a regra aqui exige atualizar o termo e incrementar a versão em
 * `modules/legal/termos.ts`.
 *
 * Módulo puro (sem `server-only`): testado e reaproveitável por rota, socket e query. Quem chama
 * resolve `moderaChat` antes (`moderadorChat()` em `chat/moderador.ts`).
 */

/** O que basta para decidir moderação. `null`/`undefined` = ninguém (falha fechada). */
export type ModeradorChat = { superUsuario: boolean; moderaChat: boolean };

/** Tipos de canal que aparecem na lista "Moderação" do observador (os demais já o incluem como membro). */
const TIPOS_MODERACAO = ["grupo", "dm", "socios", "anotacoes"] as const;

export function podeObservarCanal(m: ModeradorChat | null | undefined, tipoCanal: string): boolean {
  if (m?.superUsuario) return true;
  if (m?.moderaChat) return tipoCanal !== "anotacoes";
  return false;
}

/**
 * Quem pode EDITAR/EXCLUIR mensagem alheia no canal (moderação). Hoje coincide com
 * `podeObservarCanal`, mas é função separada de propósito: ampliar quem LÊ (ex.: sócio) não
 * pode, por tabela, dar a ninguém o poder de apagar mensagens.
 */
export function podeModerarCanal(m: ModeradorChat | null | undefined, tipoCanal: string): boolean {
  if (m?.superUsuario) return true;
  if (m?.moderaChat) return tipoCanal !== "anotacoes";
  return false;
}

/** Tipos de canal que a pessoa enxerga na lista de moderação (vazio = não observa nada). */
export function tiposModeracao(m: ModeradorChat | null | undefined): string[] {
  return TIPOS_MODERACAO.filter((t) => podeObservarCanal(m, t));
}
