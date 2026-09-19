/**
 * Cópia para a área de transferência (cliente). Devolve se deu certo — quem chama avisa o
 * usuário, com o texto da sua tela.
 *
 * `navigator.clipboard` não existe em contexto inseguro (http fora de localhost) e pode ser
 * negado por permissão: sem o try/catch, "Copiar link" viraria um erro não tratado no console e
 * silêncio na tela.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
