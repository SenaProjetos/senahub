import "server-only";
import { createReadStream, type ReadStream } from "node:fs";
import { PassThrough, Readable } from "node:stream";
import { ZipArchive } from "archiver";

/** Como o .zip terminou do lado do cliente (ver `zipEmStream`). */
export type FimDoZip = "completo" | "interrompido";

/**
 * Monta um .zip em stream para a resposta HTTP. `caminho` já resolvido (via `resolverCaminho`) e conferido.
 *
 * - Ritmo: o archiver escreve num `PassThrough` por `pipe`, e o stream web só puxa quando o cliente lê — um
 *   pacote grande não vai inteiro para a memória quando o download é lento.
 * - Um arquivo aberto por vez: o seguinte só é aberto quando o anterior entrou no pacote (evento `entry`).
 * - Cancelamento (aba fechada, rede caiu) ou erro: o arquivo em leitura é fechado e o archiver é desmontado.
 *   Só `abort()` não basta — ele espera a entrada em andamento terminar, e ela fica parada para sempre com o
 *   arquivo aberto (no Windows, preso para renomear, substituir e lixeira até reiniciar o servidor).
 *
 * `aoFim` diz como terminou: `completo` só quando o último pedaço foi entregue a quem responde (aproximação
 * do "o cliente recebeu": o que ainda estiver no buffer do socket não é visto daqui); `interrompido` se cancelou
 * ou deu erro. A auditoria e o histórico de acessos são gravados ali, não antes do primeiro byte.
 * `abrir` existe para o teste observar os arquivos abertos; as rotas usam o padrão.
 */
export function zipEmStream(
  entradas: { caminho: string; nome: string }[],
  opcoes: { aoFim?: (fim: FimDoZip) => void; abrir?: (caminho: string) => ReadStream } = {},
): ReadableStream<Uint8Array> {
  const abrir = opcoes.abrir ?? createReadStream;
  let avisou = false;
  const avisar = (fim: FimDoZip) => {
    if (avisou) return;
    avisou = true;
    try {
      opcoes.aoFim?.(fim);
    } catch (err) {
      console.error("[zip] erro no aviso de fim:", err);
    }
  };
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const saida = new PassThrough();
  const emLeitura = new Set<ReadStream>();
  let encerrado = false;

  archive.on("warning", (err) => console.warn("[zip] warning:", err));
  archive.on("error", (err) => {
    console.error("[zip] erro no archiver:", err);
    saida.destroy(err);
  });
  // Fechou antes de terminar = cancelado ou com erro: solta o que estiver aberto e para de vez.
  saida.on("close", () => {
    if (!saida.readableEnded) avisar("interrompido");
    if (saida.writableFinished) return;
    encerrado = true;
    for (const rs of emLeitura) rs.destroy();
    emLeitura.clear();
    archive.abort();
    archive.destroy();
  });
  archive.pipe(saida);

  let i = 0;
  const proxima = () => {
    if (encerrado) return;
    if (i >= entradas.length) {
      archive.finalize().catch(() => {
        // O erro já chegou pelo evento "error" (ou foi o abort do cancelamento).
      });
      return;
    }
    const e = entradas[i++];
    const rs = abrir(e.caminho);
    emLeitura.add(rs);
    rs.on("close", () => emLeitura.delete(rs));
    archive.append(rs, { name: e.nome });
  };
  archive.on("entry", proxima);
  proxima();
  // "completo" só quando quem responde pediu mais e o pacote acabou (o último pedaço já saiu), não quando o
  // último pedaço entrou numa fila: a leitura é puxada sob demanda (highWaterMark 0).
  const leitor = (Readable.toWeb(saida) as ReadableStream<Uint8Array>).getReader();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const { done, value } = await leitor.read();
          if (done) {
            controller.close();
            avisar("completo");
          } else controller.enqueue(value);
        } catch (err) {
          avisar("interrompido");
          controller.error(err);
        }
      },
      cancel(motivo) {
        avisar("interrompido");
        return leitor.cancel(motivo);
      },
    },
    { highWaterMark: 0 },
  );
}
