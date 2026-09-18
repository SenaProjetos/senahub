"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileText, Paperclip, Trash2 } from "lucide-react";
import { adicionarAnexoLead, removerAnexoLead } from "@/modules/comercial/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AnexoLead = { id: string; nome: string; nomeArquivo: string; tamanho: number };

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Anexos do lead (proposta, e-mail de solicitação da arquitetura, referências).
 * Envia pela rota multipart `/api/comercial/anexos` → `adicionarAnexoLead`.
 */
export function LeadAnexos({ leadId, anexos }: { leadId: string; anexos: AnexoLead[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Selecione um arquivo.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/comercial/anexos", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await adicionarAnexoLead({ leadId, meta });
      if (r.ok) {
        toast.success("Anexo adicionado.");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function rm(id: string) {
    start(async () => {
      const r = await removerAnexoLead({ id });
      if (r.ok) {
        toast.success("Anexo removido.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-2 rounded-sm border border-dashed p-3">
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Paperclip className="size-3.5" /> Anexos ({anexos.length})
      </Label>
      {anexos.length > 0 && (
        <ul className="divide-y text-sm">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate" title={a.nomeArquivo}>{a.nome}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtBytes(a.tamanho)}</span>
              </span>
              <span className="flex shrink-0 items-center">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Baixar anexo"
                  render={<a href={`/api/comercial/anexos/${a.id}/download`} />}
                >
                  <Download className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remover anexo"
                  onClick={() => rm(a.id)}
                  disabled={pending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input ref={fileRef} type="file" className="min-w-32 flex-1" />
        <Button size="sm" variant="outline" onClick={enviar} disabled={busy}>
          <Paperclip className="size-3.5" /> {busy ? "Enviando…" : "Anexar"}
        </Button>
      </div>
    </div>
  );
}
