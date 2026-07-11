/**
 * Coordenação BIM — lógica PURA da máquina de estados da conversão IFC → Fragments.
 * Sem I/O (nem Prisma, nem spawn, nem fs) para ser testável em isolamento.
 * O orquestrador (conversao.ts) e o converter (scripts/converter-ifc.ts) usam estas
 * funções; toda decisão de transição/retry/caminho fica aqui.
 */
import path from "node:path";

export type StatusConversao = "fila" | "processando" | "concluido" | "erro";

/** Nome da fila pg-boss on-demand da conversão IFC → Fragments. */
export const FILA_CONVERTER_IFC = "converter-ifc";

/** Nº máximo de tentativas (o enfileiramento recusa quando já esgotou). */
export const MAX_TENTATIVAS = 3;

/** Tamanho máximo do IFC aceito para conversão (limite prático do wasm32 ~4 GB). */
export const TAMANHO_MAX_IFC = 2 * 1024 * 1024 * 1024; // 2 GB

/**
 * Pode (re)enfileirar a conversão deste modelo?
 * - `fila`/`processando`: já está em andamento, não reenfileira.
 * - `concluido`: só reprocessa se forçado (nova versão gera OUTRA linha, não passa por aqui).
 * - `erro`: reprocessa enquanto não estourou o teto de tentativas.
 * - sem linha ainda (`undefined`): sempre pode.
 */
export function podeEnfileirar(
  atual: { status: StatusConversao; tentativas: number } | undefined,
  opts: { forcar?: boolean } = {},
): boolean {
  if (!atual) return true;
  if (opts.forcar) return atual.status !== "processando";
  switch (atual.status) {
    case "erro":
      return atual.tentativas < MAX_TENTATIVAS;
    case "concluido":
    case "fila":
    case "processando":
      return false;
  }
}

/** Resultado do processo converter → estado final + campos a gravar. */
export function resultadoConversao(saida: {
  code: number | null;
  erro?: string | null;
  caminhoFrag?: string | null;
  tamanhoFrag?: number | null;
  duracaoMs?: number | null;
}): {
  status: Extract<StatusConversao, "concluido" | "erro">;
  caminhoFrag: string | null;
  tamanhoFrag: number | null;
  erro: string | null;
  duracaoMs: number | null;
} {
  const okProcesso = saida.code === 0 && !saida.erro && !!saida.caminhoFrag;
  if (okProcesso) {
    return {
      status: "concluido",
      caminhoFrag: saida.caminhoFrag ?? null,
      tamanhoFrag: saida.tamanhoFrag ?? null,
      erro: null,
      duracaoMs: saida.duracaoMs ?? null,
    };
  }
  return {
    status: "erro",
    caminhoFrag: null,
    tamanhoFrag: null,
    erro: saida.erro?.slice(0, 500) || `Conversão falhou (código ${saida.code ?? "?"}).`,
    duracaoMs: saida.duracaoMs ?? null,
  };
}

/**
 * Caminho relativo (posix, sob STORAGE_BASE_PATH) onde o .frag é gravado.
 * `.../{disciplina}/{pacote}/{arquivo.ifc}` → `.../{disciplina}/COORDENACAO/{uploadId}.frag`
 * (irmão da pasta do pacote, um por versão de Upload).
 */
export function caminhoFragDeUpload(uploadCaminho: string, uploadId: string): string {
  const posix = path.posix;
  const normal = uploadCaminho.replace(/\\/g, "/");
  const discDir = posix.dirname(posix.dirname(normal));
  return posix.join(discDir, "COORDENACAO", `${uploadId}.frag`);
}
