import { precisaChunk, enviarEmChunks } from "@/lib/upload-grande";
import type { MetaDocumento } from "@/modules/documentos-cliente/schemas";

/** Categorias da pasta Geral do projeto. */
export const CATEGORIAS_GERAL = ["contrato", "planta", "memorial", "foto", "administrativo", "outro"] as const;

/** Sobe o arquivo de um Documento (Base, Recebidos ou Geral) e devolve o meta para `criarDocumento`/`adicionarVersaoDocumento`. */
export async function subirDocumento(
  file: File,
  projetoId: string,
  clienteId: string | null,
  origem?: "recebido_cliente" | "interno",
): Promise<MetaDocumento> {
  const fd = new FormData();
  fd.append("projetoId", projetoId);
  if (clienteId) fd.append("clienteId", clienteId);
  if (origem) fd.append("origem", origem);
  // Arquivos grandes vão em pedaços (Cloudflare corta em ~100 MB); os pequenos, direto.
  if (precisaChunk(file)) {
    const meta = await enviarEmChunks(file);
    fd.append("sessaoId", meta.sessaoId);
    fd.append("nome", file.name);
    fd.append("total", String(meta.total));
    fd.append("tamanho", String(meta.tamanho));
    fd.append("mime", file.type || "");
  } else {
    fd.append("file", file);
  }
  const res = await fetch("/api/documentos", { method: "POST", body: fd });
  const meta = await res.json();
  if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
  return meta as MetaDocumento;
}
