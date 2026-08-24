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
