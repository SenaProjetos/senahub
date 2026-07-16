"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Download, FileText } from "lucide-react";
import { adicionarDocumentoFuncionario, removerDocumentoFuncionario } from "@/modules/rh/funcionarios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type DocumentoItem = {
  id: string; tipo: string; nome: string; nomeArquivo: string; tamanho: number; criadoEm: string;
};

const TIPOS_DOC = ["contrato", "rg", "cpf", "aso", "diploma", "comprovante", "outro"] as const;

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Documentos de uma pessoa, na ficha 360. Baixar sempre; anexar/remover só com
 * `podeEditar` (HR-admin). Reusa a rota multipart e as actions de funcionários.
 */
export function DocumentosEditor({
  pessoaId,
  documentos,
  podeEditar,
}: {
  pessoaId: string;
  documentos: DocumentoItem[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [docTipo, setDocTipo] = useState("contrato");
  const [docNome, setDocNome] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!docNome.trim() || !file) {
      toast.error("Informe o nome e selecione um arquivo.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/rh/funcionarios/documentos", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await adicionarDocumentoFuncionario({
        userId: pessoaId,
        tipo: docTipo as (typeof TIPOS_DOC)[number],
        nome: docNome,
        meta,
      });
      if (r.ok) {
        toast.success("Documento anexado.");
        setDocNome("");
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
      const r = await removerDocumentoFuncionario({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Documentos ({documentos.length})</h4>
      {documentos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento anexado.</p>
      ) : (
        <ul className="divide-y text-sm">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{d.nome}</span>
                <Badge variant="outline" className="capitalize">{d.tipo}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{fmtBytes(d.tamanho)}</span>
              </span>
              <span className="flex shrink-0 items-center">
                <Button size="icon" variant="ghost" aria-label="Baixar" render={<a href={`/api/rh/funcionarios/documentos/${d.id}/download`} />}>
                  <Download className="size-3.5" />
                </Button>
                {podeEditar && (
                  <Button size="icon" variant="ghost" aria-label="Remover documento" onClick={() => rm(d.id)} disabled={pending}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {podeEditar && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <Select value={docTipo} onValueChange={(v) => setDocTipo(v ?? "contrato")}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_DOC.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Nome do documento" value={docNome} onChange={(e) => setDocNome(e.target.value)} className="min-w-32 flex-1" />
          <Input ref={fileRef} type="file" className="w-44" />
          <Button size="sm" variant="outline" onClick={enviar} disabled={busy}>
            <Plus className="size-3.5" /> {busy ? "Enviando…" : "Anexar"}
          </Button>
        </div>
      )}
    </div>
  );
}
