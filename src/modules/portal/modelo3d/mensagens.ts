// Frases da rota `.frag` do portal e da tela 3D (puro: a rota e o navegador leem daqui).

export const MSG_ROTA_SEM_SESSAO = "Sua sessão expirou. Entre de novo para ver o modelo.";
export const MSG_ROTA_INDISPONIVEL = "Modelo indisponível.";
export const MSG_ROTA_ARQUIVO_SUMIU = "O modelo 3D não está disponível no momento. Avise a equipe do projeto.";

/** O que a tela mostra quando o modelo não abre por um motivo que não é da rota (rede, arquivo corrompido, WebGL). */
export const MSG_ABRIR_FALHOU = "Não foi possível abrir o modelo. Tente de novo.";

const DA_ROTA: ReadonlySet<string> = new Set([MSG_ROTA_SEM_SESSAO, MSG_ROTA_INDISPONIVEL, MSG_ROTA_ARQUIVO_SUMIU]);

/**
 * A frase que a pessoa lê quando um modelo não abre: as frases da própria rota (já escritas para o cliente) passam; o
 * resto — erro do motor 3D, da rede, em inglês ou técnico — vira a frase fixa. O detalhe fica para o console.
 */
export function mensagemDaFalhaAoAbrir(e: unknown): string {
  return e instanceof Error && DA_ROTA.has(e.message) ? e.message : MSG_ABRIR_FALHOU;
}
