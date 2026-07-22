"use client";

import { useState } from "react";
import { unzipSync } from "fflate";
import { toast } from "sonner";
import { UploadCloud, CheckCircle2, HelpCircle } from "lucide-react";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import { montarTopicosDoZip, type TopicoComSnapshot } from "@/modules/coordenacao/bcf/importar";
import { importarTopicoBcf } from "@/modules/coordenacao/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ModeloBcfImport = { uploadId: string; disciplinaId: string | null; label: string };

type TopicoResolvido = { topico: TopicoComSnapshot; modeloId: string | null };

async function enviarSnapshot(apontamentoId: string, bytes: Uint8Array) {
  const fd = new FormData();
  fd.append("apontamentoId", apontamentoId);
  fd.append("file", new File([new Uint8Array(bytes)], "snapshot.png", { type: "image/png" }));
  await fetch("/api/coordenacao/snapshot", { method: "POST", body: fd }).catch(() => {});
}

/**
 * Importa um `.bcfzip` (Navisworks/Solibri/BIMcollab): descompacta no navegador
 * (fflate), monta os tópicos (bcf/importar.ts), tenta ancorar cada um a um modelo
 * carregado por IfcGuid (`engine.resolverModeloPorGuids`) e cria 1 apontamento por
 * tópico — dedup por `bcfGuid`, então reimportar o mesmo arquivo não duplica.
 */
export function BcfImportDialog({
  aberto,
  onFechar,
  engine,
  modelos,
  projetoId,
}: {
  aberto: boolean;
  onFechar: () => void;
  engine: ViewerEngine | null;
  modelos: ModeloBcfImport[];
  projetoId: string;
}) {
  const [resolvidos, setResolvidos] = useState<TopicoResolvido[]>([]);
  const [modeloFallbackId, setModeloFallbackId] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [importando, setImportando] = useState(false);

  async function onArquivo(file: File) {
    setProcessando(true);
    setResolvidos([]);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const arquivos = unzipSync(bytes);
      const topicos = montarTopicosDoZip(arquivos);
      if (topicos.length === 0) {
        toast.error("Nenhum tópico BCF válido encontrado no arquivo.");
        return;
      }
      const lista: TopicoResolvido[] = [];
      for (const topico of topicos) {
        const r = engine ? await engine.resolverModeloPorGuids(topico.guids) : null;
        lista.push({ topico, modeloId: r?.modeloId ?? null });
      }
      setResolvidos(lista);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler o arquivo .bcfzip.");
    } finally {
      setProcessando(false);
    }
  }

  function nomeModelo(uploadId: string | null) {
    return modelos.find((m) => m.uploadId === uploadId)?.label ?? null;
  }

  async function importar() {
    if (resolvidos.length === 0) return;
    setImportando(true);
    let criados = 0;
    let duplicados = 0;
    let semModelo = 0;
    try {
      for (const { topico, modeloId } of resolvidos) {
        const alvoId = modeloId ?? modeloFallbackId;
        if (!alvoId) {
          semModelo++;
          continue;
        }
        const modelo = modelos.find((m) => m.uploadId === alvoId);
        const camera = topico.camera ?? engine?.capturarCamera() ?? { position: [0, 0, 10], target: [0, 0, 0] };
        const r = await importarTopicoBcf({
          projetoId,
          disciplinaId: modelo?.disciplinaId ?? undefined,
          uploadId: alvoId,
          bcfGuid: topico.guid,
          titulo: topico.title,
          texto: topico.description,
          guids: topico.guids,
          camera,
        });
        if (!r.ok) {
          toast.error(`"${topico.title || topico.guid}": ${r.error}`);
          continue;
        }
        if (r.data.duplicado) {
          duplicados++;
          continue;
        }
        criados++;
        if (topico.snapshotBytes) await enviarSnapshot(r.data.id, topico.snapshotBytes);
      }
      toast.success(
        `${criados} apontamento(s) importado(s)` +
          (duplicados > 0 ? `, ${duplicados} já existiam` : "") +
          (semModelo > 0 ? `, ${semModelo} sem modelo (pulados)` : "") +
          ".",
      );
      setResolvidos([]);
      onFechar();
    } finally {
      setImportando(false);
    }
  }

  const semCorrespondencia = resolvidos.filter((r) => r.modeloId === null).length;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar BCF</DialogTitle>
        </DialogHeader>

        {resolvidos.length === 0 ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded border border-dashed p-8 text-center text-sm text-muted-foreground hover:bg-muted/30">
            <UploadCloud className="size-6" />
            {processando ? "Lendo arquivo…" : "Escolher .bcfzip"}
            <input
              type="file"
              accept=".bcfzip,.zip"
              className="hidden"
              disabled={processando}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onArquivo(file);
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          <>
            <ScrollArea className="max-h-[40vh]">
              <div className="space-y-1.5 pr-3">
                {resolvidos.map(({ topico, modeloId }) => (
                  <div key={topico.guid} className="flex items-center gap-2 rounded bg-muted/30 px-2.5 py-1.5 text-xs">
                    {modeloId ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-status-aprovado" />
                    ) : (
                      <HelpCircle className="size-3.5 shrink-0 text-warning" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{topico.title || "(sem título)"}</p>
                      <p className="truncate text-muted-foreground">{nomeModelo(modeloId) ?? "sem correspondência"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {semCorrespondencia > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  {semCorrespondencia} tópico(s) sem modelo carregado correspondente — escolha o destino:
                </p>
                <Select value={modeloFallbackId ?? ""} onValueChange={(v) => setModeloFallbackId(v || null)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Modelo de destino (fallback)" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelos.map((m) => (
                      <SelectItem key={m.uploadId} value={m.uploadId}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Badge variant="outline" className="w-fit text-xs">
              {resolvidos.length} tópico(s) encontrado(s)
            </Badge>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          {resolvidos.length > 0 && (
            <Button type="button" onClick={() => void importar()} disabled={importando}>
              {importando ? "Importando…" : `Importar ${resolvidos.length}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
