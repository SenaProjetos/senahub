/**
 * Coordenação BIM — monta os tópicos de um `.bcfzip` JÁ DESCOMPACTADO (path→bytes).
 * PURO: não depende de fflate nem faz a descompressão (fica no client, F2, via
 * `unzipSync`) — só agrupa por pasta `{TopicGuid}/` e delega ao reader.ts.
 * Testável com um Record fabricado (sem precisar de um .bcfzip real nos testes).
 */
import { lerTopico, type TopicoImportado } from "@/modules/coordenacao/bcf/reader";

export type TopicoComSnapshot = TopicoImportado & { snapshotBytes: Uint8Array | null };

const decoder = new TextDecoder("utf-8");

/**
 * Agrupa os arquivos por pasta (1º segmento do path) e monta um tópico por pasta
 * que tiver `markup.bcf` (sem isso não há Topic válido). Arquivos na raiz
 * (`bcf.version`) são ignorados — não pertencem a pasta nenhuma.
 */
export function montarTopicosDoZip(arquivos: Record<string, Uint8Array>): TopicoComSnapshot[] {
  const porPasta = new Map<string, Record<string, Uint8Array>>();
  for (const [caminho, bytes] of Object.entries(arquivos)) {
    const barra = caminho.indexOf("/");
    if (barra <= 0) continue; // sem pasta (ex.: bcf.version) — ignora
    const pasta = caminho.slice(0, barra);
    const nomeArquivo = caminho.slice(barra + 1);
    if (!nomeArquivo || nomeArquivo.includes("/")) continue; // ignora subpastas extras
    const grupo = porPasta.get(pasta) ?? {};
    grupo[nomeArquivo] = bytes;
    porPasta.set(pasta, grupo);
  }

  const topicos: TopicoComSnapshot[] = [];
  for (const grupo of porPasta.values()) {
    const markupBytes = grupo["markup.bcf"];
    if (!markupBytes) continue;
    const markup = decoder.decode(markupBytes);
    const vpBytes = grupo["viewpoint.bcfv"];
    const viewpoint = vpBytes ? decoder.decode(vpBytes) : null;
    const topico = lerTopico(markup, viewpoint);
    if (!topico) continue;
    const snapshotBytes = topico.snapshotFile ? (grupo[topico.snapshotFile] ?? null) : null;
    topicos.push({ ...topico, snapshotBytes });
  }
  return topicos;
}
