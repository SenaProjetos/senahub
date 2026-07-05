"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Upload, FileText } from "lucide-react";
import type { DocumentoItem } from "@/modules/documentos-cliente/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Documentos do projeto no portal do cliente: lista + envio do próprio cliente. */
export function PortalDocumentos({ projetoId, docs }: { projetoId: string; docs: DocumentoItem[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function enviar() {
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    try {
      let ok = 0;
      for (const file of files) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("projetoId", projetoId);
          const res = await fetch("/api/portal/documentos", { method: "POST", body: fd });
          if (res.ok) ok += 1;
          else {
            const data = await res.json().catch(() => ({}));
            toast.error(`${file.name}: ${data.error ?? "Falha no envio."}`);
          }
        } catch {
          toast.error(`${file.name}: falha de conexão.`);
        }
      }
      if (ok > 0) toast.success(`${ok} arquivo(s) enviado(s).`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Documentos</CardTitle>
        <CardDescription>Envie plantas, referências e documentos para a equipe. Arquivos do projeto ficam aqui.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {docs.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhum documento ainda." />
        ) : (
          <ul className="divide-y rounded-sm border text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{d.nome}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{d.atual ? fmtBytes(d.atual.tamanho) : "—"}</span>
                  {d.atual && (
                    <Button size="icon" variant="ghost" aria-label={`Baixar ${d.nome}`} render={<a href={d.atual.downloadUrl} />}>
                      <Download className="size-3.5" />
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <Input ref={fileRef} type="file" multiple className="text-xs" />
          <Button size="sm" variant="outline" onClick={enviar} disabled={busy}>
            <Upload className="size-3.5" /> {busy ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
