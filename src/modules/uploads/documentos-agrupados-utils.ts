import { parsePranchaFilename } from "@/modules/projetos/pranchas/codigo";

/** Forma mínima usada para decidir qual revisão ainda está disponível na tela. */
export type UploadComRevisao = {
  revisaoId: string | null;
  revisao: { numero: number } | null;
};

/**
 * A lista recebida já exclui a lixeira. Por isso a revisão atual deve ser calculada a partir
 * dela, e não a partir do histórico completo do documento.
 */
export function revisaoAtualDosUploads<T extends UploadComRevisao>(uploads: T[]): number | null {
  return uploads.reduce<number | null>((maior, upload) => {
    const numero = upload.revisao?.numero;
    return numero !== undefined && numero !== null && (maior === null || numero > maior) ? numero : maior;
  }, null);
}

/**
 * Retém os arquivos da revisão disponível mais recente. Uploads legados sem revisão seguem
 * visíveis para não desaparecerem enquanto a migração de dados não os tiver associado.
 */
export function arquivosDaRevisaoAtual<T extends UploadComRevisao>(uploads: T[]): T[] {
  const revisaoAtual = revisaoAtualDosUploads(uploads);
  if (revisaoAtual === null) return uploads;
  return uploads.filter((upload) => upload.revisao?.numero === revisaoAtual || upload.revisaoId === null);
}

/**
 * Numeração + tipo lidos do nome, no formato combinado `"6008-3D"`.
 *
 * NÃO é mais a fonte da coluna "Nº" de `documentos-agrupados.ts` (F4): a tabela hoje prefere
 * `DocumentoDisciplina.numeroPrancha`/`.tipo` (gravados pelo motor de nomenclatura), caindo
 * para a leitura do nome só quando o documento ainda não tem os dois — e os mostra em colunas
 * SEPARADAS (Nº e Tipo), não combinados. Esta função fica pura e testada para quem ainda
 * precisar do formato combinado.
 */
export function numeroPrancha(nomeArquivo: string): string | null {
  const p = parsePranchaFilename(nomeArquivo);
  return p ? `${String(p.numeracao).padStart(4, "0")}-${p.tipo}` : null;
}

/**
 * Chave que liga um documento à prancha da Lista Mestre da MESMA disciplina: numeração + tipo
 * + fase — a mesma trinca que o import da Lista Mestre usa para não duplicar prancha.
 */
export function chavePrancha(disciplinaId: string, p: { numeracao: number; tipo: string; fase: string }): string {
  return `${disciplinaId}|${p.numeracao}|${p.tipo.toUpperCase()}|${p.fase.toUpperCase()}`;
}
