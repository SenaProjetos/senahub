/**
 * Regras puras do Socket.io por tipo de conta. O cliente do portal (`User.tipo = externo`) conecta
 * para receber avisos próprios (`user:<id>`), mas nunca entra em rooms internos (presença, canais
 * de chat, documentos) nem consulta/emite nada deles.
 */

/** Room de todas as conexões de usuários internos — destino dos eventos de presença. */
export const ROOM_INTERNOS = "internos";

export function roomsIniciais(p: { userId: string; externo: boolean }): string[] {
  const proprio = `user:${p.userId}`;
  return p.externo ? [proprio] : [proprio, ROOM_INTERNOS];
}

/** Eventos de entrada do cliente socket (`entrar-canal`, `entrar-documento`, `digitando`…): só interno. */
export function aceitaEvento(externo: boolean, evento: string): boolean {
  // Hoje nenhum evento de entrada é do cliente; o nome fica na assinatura para uma exceção futura sem mudar quem chama.
  void evento;
  return !externo;
}

/** Só conta interna entra no mapa de presença. */
export function contaNaPresenca(externo: boolean): boolean {
  return !externo;
}
