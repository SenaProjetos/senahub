/**
 * Detecta, ANTES de enviar, quais arquivos vão virar nova revisão de algo que já existe.
 * Puro, sem I/O — espelha no cliente a regra que o servidor aplica em `/api/uploads`
 * (`versao = anterior.versao + 1` para a mesma chave lógica).
 *
 * Existe por causa do item 12 da spec: "Nunca substituir silenciosamente uma revisão
 * existente". Hoje o envio de um nome repetido cria a versão nova sem nenhum aviso na tela.
 *
 * A chave de comparação é `nomeArquivo` exato dentro do mesmo destino (pacote ou pasta) —
 * a mesma que `/api/uploads` usa para calcular a versão. Não é a chave normalizada de
 * `chaveDocumento()`, que muda na Fase 2: quando mudar, este arquivo acompanha.
 */

export type ArquivoExistente = {
  nome: string;
  /** Pacote (A|B|OUTROS|RECEBIDOS) quando o arquivo vive no fluxo legado. */
  pacote?: string | null;
  /** Pasta da árvore `PastaProjeto`, quando o arquivo vive nela. */
  pastaId?: string | null;
  versao: number;
};

export type DestinoEnvio = { pacote?: string | null; pastaId?: string | null };

export type RevisaoDetectada = {
  nome: string;
  /** Maior versão já existente no destino — a nova entra como `versaoAtual + 1`. */
  versaoAtual: number;
};

function mesmoDestino(a: ArquivoExistente, destino: DestinoEnvio): boolean {
  // Pacote XOR pasta é invariante do schema, então basta bater o lado preenchido.
  if (destino.pastaId) return a.pastaId === destino.pastaId;
  return a.pastaId == null && (a.pacote ?? null) === (destino.pacote ?? null);
}

/**
 * Para cada nome a enviar, devolve a revisão que ele substituirá — ou nada, se for inédito.
 * Nomes repetidos na mesma seleção aparecem uma vez só.
 */
export function detectarNovasRevisoes(
  nomesAEnviar: string[],
  existentes: ArquivoExistente[],
  destino: DestinoEnvio,
): RevisaoDetectada[] {
  const noDestino = existentes.filter((a) => mesmoDestino(a, destino));
  if (noDestino.length === 0) return [];

  const maiorVersao = new Map<string, number>();
  for (const a of noDestino) {
    maiorVersao.set(a.nome, Math.max(maiorVersao.get(a.nome) ?? 0, a.versao));
  }

  const vistos = new Set<string>();
  const achados: RevisaoDetectada[] = [];
  for (const nome of nomesAEnviar) {
    if (vistos.has(nome)) continue;
    vistos.add(nome);
    const versaoAtual = maiorVersao.get(nome);
    if (versaoAtual !== undefined) achados.push({ nome, versaoAtual });
  }
  return achados;
}

/** Frase de aviso em pt-BR, pronta para o toast. Vazio → string vazia (não avisa nada). */
export function mensagemNovasRevisoes(revisoes: RevisaoDetectada[]): string {
  if (revisoes.length === 0) return "";
  if (revisoes.length === 1) {
    const { nome, versaoAtual } = revisoes[0];
    return `"${nome}" já existe (v${versaoAtual}) — será enviado como v${versaoAtual + 1}. A versão anterior é mantida no histórico.`;
  }
  return `${revisoes.length} arquivos já existem e serão enviados como novas versões. As versões anteriores são mantidas no histórico.`;
}
