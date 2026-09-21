import "server-only";
import { prisma } from "@/lib/prisma";
import { listarArquivos, removerArquivo } from "@/lib/storage";
import { CARENCIA_PDF_ORFAO_MS, PASTA_PDF_EXTERNO, selecionarPdfsOrfaos } from "@/modules/comercial/proposta-externa";

/**
 * Apaga os PDFs de proposta externa que foram enviados mas nunca entraram numa versão — o upload
 * acontece antes do registro, então fechar o diálogo (ou o registro ser recusado) deixa o arquivo
 * para trás. Devolve quantos removeu. Idempotente: rodar de novo não acha mais nada.
 *
 * A referência vem do banco a cada execução, nunca de uma lista guardada: um PDF que ganhou versão
 * entre uma execução e outra deixa de ser candidato sozinho.
 */
export async function limparPdfsExternosOrfaos(
  agora: Date = new Date(),
  carenciaMs: number = CARENCIA_PDF_ORFAO_MS,
): Promise<number> {
  const arquivos = await listarArquivos(PASTA_PDF_EXTERNO);
  if (arquivos.length === 0) return 0;

  const usados = await prisma.propostaVersao.findMany({
    where: { pdfPath: { startsWith: PASTA_PDF_EXTERNO } },
    select: { pdfPath: true },
  });
  const referenciados = new Set(usados.map((v) => v.pdfPath!));

  const orfaos = selecionarPdfsOrfaos(arquivos, referenciados, agora, carenciaMs);
  for (const caminho of orfaos) await removerArquivo(caminho);
  return orfaos.length;
}
