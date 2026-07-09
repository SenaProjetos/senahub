/**
 * Upload de arquivos grandes em pedaços (chunked), do lado do cliente.
 *
 * Produção passa por Cloudflare Tunnel, que corta requests acima de ~100 MB na
 * borda (modelos IFC/BIM estouram isso). Abaixo de `LIMITE_ENVIO_DIRETO` o envio
 * segue direto (1 request, comportamento antigo); acima, o arquivo é fatiado em
 * pedaços de `TAM_CHUNK` (bem abaixo de 100 MB) e cada um vai num POST separado
 * para /api/uploads/chunk. A rota de finalização remonta os pedaços em disco.
 */

/** Acima disso, envia em pedaços. 70 MB deixa folga sob o teto de 100 MB do Cloudflare. */
export const LIMITE_ENVIO_DIRETO = 70 * 1024 * 1024;

/** Tamanho de cada pedaço. 45 MB dá margem confortável sob os 100 MB da borda. */
const TAM_CHUNK = 45 * 1024 * 1024;

/** Decide se o arquivo precisa ir em pedaços. */
export function precisaChunk(file: File): boolean {
  return file.size > LIMITE_ENVIO_DIRETO;
}

export type MetaChunk = { sessaoId: string; total: number; tamanho: number };

function enviarChunk(
  blob: Blob,
  sessaoId: string,
  indice: number,
  total: number,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/uploads/chunk?sessao=${encodeURIComponent(sessaoId)}&i=${indice}&n=${total}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let msg = `Falha no envio do pedaço ${indice + 1}/${total} (HTTP ${xhr.status}).`;
        try {
          const j = JSON.parse(xhr.responseText);
          if (j?.error) msg = j.error;
        } catch {
          /* corpo não-JSON */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Falha de rede durante o envio — verifique a conexão."));
    xhr.send(blob);
  });
}

/**
 * Envia o arquivo em pedaços sequenciais e resolve com os metadados da sessão
 * (para a chamada de finalização). `onProgress` recebe o progresso global 0–100.
 */
export async function enviarEmChunks(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<MetaChunk> {
  const sessaoId = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, "");
  const total = Math.max(1, Math.ceil(file.size / TAM_CHUNK));
  for (let i = 0; i < total; i++) {
    const inicio = i * TAM_CHUNK;
    const blob = file.slice(inicio, Math.min(inicio + TAM_CHUNK, file.size));
    await enviarChunk(blob, sessaoId, i, total, (pctChunk) => {
      const global = ((i + pctChunk / 100) / total) * 100;
      onProgress?.(Math.min(100, Math.round(global)));
    });
  }
  return { sessaoId, total, tamanho: file.size };
}
