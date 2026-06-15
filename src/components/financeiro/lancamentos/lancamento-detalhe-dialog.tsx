"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import {
  salvarTagsLancamento,
  adicionarAnexoLancamento,
  removerAnexoLancamento,
} from "@/modules/financeiro/lancamentos/actions";
import type { LancamentoItem } from "@/modules/financeiro/lancamentos/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function LancamentoDetalheDialog({
  lancamento,
  podeGerir,
  onClose,
}: {
  lancamento: LancamentoItem | null;
  podeGerir: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState(lancamento?.tags.join(", ") ?? "");
  const key = lancamento?.id ?? "";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setTags(lancamento?.tags.join(", ") ?? "");
  }
  if (!lancamento) return null;
  const l = lancamento;

  function salvarTags() {
    const arr = tags.split(",").map((t) => t.trim()).filter(Boolean);
    start(async () => {
      const r = await salvarTagsLancamento({ id: l.id, tags: arr });
      if (r.ok) {
        toast.success("Etiquetas salvas.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  async function enviarAnexo() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/financeiro/lancamentos/anexo", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await adicionarAnexoLancamento({ lancamentoId: l.id, meta });
      if (r.ok) {
        toast.success("Anexo enviado.");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function removerAnexo(id: string) {
    start(async () => {
      const r = await removerAnexoLancamento({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!lancamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate">{l.descricao}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Etiquetas */}
          <div className="space-y-1.5">
            <Label className="text-xs">Etiquetas (separe por vírgula)</Label>
            <div className="flex gap-2">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="reembolso, urgente…" disabled={!podeGerir} />
              {podeGerir && (
                <Button size="sm" variant="outline" onClick={salvarTags} disabled={pending}>Salvar</Button>
              )}
            </div>
            {l.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {l.tags.map((t) => (
                  <Badge key={t} variant="outline">{t}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Anexos */}
          <div className="space-y-1.5">
            <Label className="text-xs">Comprovantes</Label>
            {l.anexos.length > 0 && (
              <ul className="divide-y rounded-sm border text-sm">
                {l.anexos.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <span className="min-w-0 truncate">{a.nome} <span className="font-mono text-xs text-muted-foreground">{fmtBytes(a.tamanho)}</span></span>
                    <span className="flex items-center">
                      <Button size="icon" variant="ghost" aria-label="Baixar" render={<a href={`/api/financeiro/lancamentos/anexo/${a.id}`} />}>
                        <Download className="size-3.5" />
                      </Button>
                      {podeGerir && (
                        <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => removerAnexo(a.id)} disabled={pending}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {podeGerir && (
              <div className="flex items-center gap-2">
                <Input ref={fileRef} type="file" className="text-xs" />
                <Button size="sm" variant="outline" onClick={enviarAnexo} disabled={busy}>
                  <Upload className="size-3.5" /> {busy ? "Enviando…" : "Anexar"}
                </Button>
              </div>
            )}
          </div>

          {/* Histórico */}
          {l.statusHistorico.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Histórico de status</Label>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {l.statusHistorico.map((h, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-mono">{new Date(h.createdAt).toLocaleString("pt-BR")}</span>
                    <span>{h.de ? `${h.de} → ` : ""}{h.para}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
