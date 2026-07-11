"use client";

import { CheckCircle2, XCircle, Loader2, Clock, FileText } from "lucide-react";
import { precisaChunk, enviarEmChunks } from "@/lib/upload-grande";
import { limiteLabelDoPacote } from "@/modules/uploads/limites";

/**
 * Upload de UM arquivo com progresso + painel de progresso por arquivo,
 * compartilhado entre a aba Arquivos e o card de disciplina (Visão Geral).
 * Usa XHR (fetch não reporta progresso de upload); arquivos grandes vão em
 * pedaços (contorna o teto de 100 MB do Cloudflare) e o progresso vem dos chunks.
 */

export type StatusEnvio = "pendente" | "enviando" | "ok" | "erro";
export type ResultadoUpload = { nome: string; ok: boolean; realocado?: boolean; motivo?: string };
export type LinhaEnvio = {
  nome: string;
  tamanho: number;
  status: StatusEnvio;
  progresso: number; // 0–100
  motivo?: string;
  realocado?: boolean;
};

/** Envia um arquivo (renomeando para `nome`) reportando o progresso 0–100. */
export async function enviarArquivoComProgresso(
  file: File,
  opts: { nome: string; disciplinaId: string; pacote: string },
  onProgress: (pct: number) => void,
): Promise<ResultadoUpload> {
  const { nome, disciplinaId, pacote } = opts;
  if (precisaChunk(file)) {
    const meta = await enviarEmChunks(file, onProgress);
    const fd = new FormData();
    fd.set("disciplinaId", disciplinaId);
    fd.set("pacote", pacote);
    fd.set("sessaoId", meta.sessaoId);
    fd.set("nome", nome);
    fd.set("total", String(meta.total));
    fd.set("tamanho", String(meta.tamanho));
    fd.set("mime", file.type || "");
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    const data = (await res.json().catch(() => null)) as { error?: string; resultados?: ResultadoUpload[] } | null;
    if (res.ok && data?.resultados?.[0]) return data.resultados[0];
    throw new Error(data?.error ?? `Falha ao finalizar o envio (HTTP ${res.status}).`);
  }

  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.set("disciplinaId", disciplinaId);
    fd.set("pacote", pacote);
    fd.append("files", file);
    fd.append("nomes", nome);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { error?: string; resultados?: ResultadoUpload[] } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.resultados?.[0]) {
        resolve(data.resultados[0]);
      } else {
        reject(
          new Error(
            data?.error ??
              (xhr.status === 413
                ? `Arquivo muito grande — limite de ${limiteLabelDoPacote(pacote)}.`
                : `Falha no envio (HTTP ${xhr.status}).`),
          ),
        );
      }
    };
    xhr.onerror = () => reject(new Error("Falha de rede durante o envio — verifique a conexão."));
    xhr.send(fd);
  });
}

/** Substitui imutavelmente a linha `i` com um patch (helper de setState). */
export function patchLinhaEnvio(lista: LinhaEnvio[], i: number, patch: Partial<LinhaEnvio>): LinhaEnvio[] {
  const copia = lista.slice();
  copia[i] = { ...copia[i], ...patch };
  return copia;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function IconeStatus({ status }: { status: StatusEnvio }) {
  if (status === "ok") return <CheckCircle2 className="size-3.5 shrink-0 text-success" />;
  if (status === "erro") return <XCircle className="size-3.5 shrink-0 text-destructive" />;
  if (status === "enviando") return <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />;
  return <Clock className="size-3.5 shrink-0 text-muted-foreground" />;
}

/** Painel de progresso: uma linha por arquivo, com barra e status. */
export function PainelProgressoEnvio({
  linhas,
  enviando,
  onFechar,
}: {
  linhas: LinhaEnvio[];
  enviando: boolean;
  onFechar: () => void;
}) {
  const feitos = linhas.filter((l) => l.status === "ok" || l.status === "erro").length;
  const erros = linhas.filter((l) => l.status === "erro").length;
  return (
    <div className="rounded-sm border bg-background/60 p-2">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-xs font-medium">
          {enviando ? "Enviando" : "Envio concluído"} · {feitos}/{linhas.length}
          {erros > 0 && <span className="ml-1 text-destructive">({erros} com erro)</span>}
        </span>
        {!enviando && (
          <button type="button" onClick={onFechar} className="text-xs text-muted-foreground hover:text-foreground">
            Fechar
          </button>
        )}
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {linhas.map((l, i) => (
          <div key={i} className="flex items-center gap-2 rounded-sm px-1 py-1">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs" title={l.nome}>
                  {l.nome}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{fmtBytes(l.tamanho)}</span>
                <IconeStatus status={l.status} />
              </div>
              {(l.status === "enviando" || l.status === "pendente") && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${l.progresso}%` }} />
                </div>
              )}
              {l.status === "erro" && l.motivo && <p className="mt-0.5 text-[11px] text-destructive">{l.motivo}</p>}
              {l.status === "ok" && l.realocado && (
                <p className="mt-0.5 text-[11px] text-warning">Formato não suportado — enviado para &quot;Outros&quot;.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
