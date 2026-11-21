/**
 * Lê o corpo JSON de uma requisição com teto de bytes — para rotas abertas ao mundo. Só conferir `Content-Length`
 * não basta: um corpo em pedaços (chunked) não o traz e `req.json()` o carregaria inteiro na memória. Aqui o
 * corpo é lido em fluxo e a leitura aborta ao passar do limite. Sem Next e sem Prisma (usa `Buffer`, então roda no Node).
 */
export type CorpoJson = { ok: true; dados: unknown } | { ok: false; status: 400 | 413; erro: string };

const GRANDE_DEMAIS: CorpoJson = { ok: false, status: 413, erro: "Respostas grandes demais." };
const INVALIDO: CorpoJson = { ok: false, status: 400, erro: "Dados inválidos." };

export async function lerJsonLimitado(req: Request, limiteBytes: number): Promise<CorpoJson> {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > limiteBytes) return GRANDE_DEMAIS;
  if (!req.body) return INVALIDO;

  const leitor = req.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > limiteBytes) {
        await leitor.cancel().catch(() => {});
        return GRANDE_DEMAIS;
      }
      pedacos.push(value);
    }
  } catch {
    return INVALIDO;
  }
  const texto = new TextDecoder().decode(Buffer.concat(pedacos));
  try {
    return { ok: true, dados: JSON.parse(texto) };
  } catch {
    return INVALIDO;
  }
}
