"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2, Upload, FileText, History } from "lucide-react";
import { criarDocumento, adicionarVersaoDocumento, excluirDocumento } from "@/modules/documentos-cliente/actions";
import type { DocumentoItem } from "@/modules/documentos-cliente/queries";
import type { MetaDocumento } from "@/modules/documentos-cliente/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { brl, formatarData } from "@/lib/utils";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Sobe UM arquivo para /api/documentos e devolve a `meta` p/ a action criar o registro. */
async function subirArquivo(file: File, propostaId: string, clienteId: string): Promise<MetaDocumento> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("propostaId", propostaId);
  fd.append("clienteId", clienteId);
  const res = await fetch("/api/documentos", { method: "POST", body: fd });
  const meta = await res.json();
  if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
  return meta as MetaDocumento;
}

type Versao = { numero: number; autor: string; data: string; titulo: string; itens: { disciplina: string; valor: number }[]; total: number };

export function PropostaExtras({
  propostaId,
  clienteId,
  documentos,
  versoes,
  podeGerir,
}: {
  propostaId: string;
  clienteId: string;
  documentos: DocumentoItem[];
  versoes: Versao[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileVersaoRef = useRef<HTMLInputElement>(null);
  const [alvoVersao, setAlvoVersao] = useState<string | null>(null);

  const [a, setA] = useState(versoes.length >= 2 ? String(versoes[1].numero) : versoes[0] ? String(versoes[0].numero) : "");
  const [b, setB] = useState(versoes[0] ? String(versoes[0].numero) : "");
  const va = versoes.find((v) => String(v.numero) === a);
  const vb = versoes.find((v) => String(v.numero) === b);

  async function enviar() {
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    try {
      let ok = 0;
      for (const file of files) {
        try {
          const meta = await subirArquivo(file, propostaId, clienteId);
          const r = await criarDocumento({ propostaId, nome: file.name, origem: "comercial", meta });
          if (r.ok) ok += 1;
          else toast.error(`${file.name}: ${r.error}`);
        } catch (e) {
          toast.error(`${file.name}: ${(e as Error).message}`);
        }
      }
      if (ok > 0) toast.success(`${ok} documento(s) enviado(s).`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function enviarVersao(documentoId: string, file: File) {
    setBusy(true);
    try {
      const meta = await subirArquivo(file, propostaId, clienteId);
      const r = await adicionarVersaoDocumento({ documentoId, meta });
      if (r.ok) {
        toast.success(`Versão ${r.data.numero} adicionada.`);
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setAlvoVersao(null);
    }
  }

  function remover(id: string) {
    start(async () => {
      const r = await excluirDocumento({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* C2 — Documentos do cliente (ex-anexos) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Documentos</CardTitle>
          <CardDescription>Arquivos da proposta e material recebido do cliente. Seguem para o projeto no aceite.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <input
            ref={fileVersaoRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && alvoVersao) enviarVersao(alvoVersao, f);
              e.target.value = "";
            }}
          />
          {documentos.length === 0 ? (
            <EmptyState icon={FileText} title="Nenhum documento" />
          ) : (
            <ul className="divide-y rounded-sm border text-sm">
              {documentos.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="min-w-0 truncate">
                    {d.nome}
                    {d.totalVersoes > 1 && <span className="ml-1 font-mono text-xs text-muted-foreground">v{d.atual?.numero}</span>}{" "}
                    <span className="font-mono text-xs text-muted-foreground">{d.atual ? fmtBytes(d.atual.tamanho) : "—"}</span>
                  </span>
                  <span className="flex items-center">
                    {d.atual && (
                      <Button size="icon" variant="ghost" aria-label="Baixar" render={<a href={d.atual.downloadUrl} />}>
                        <Download className="size-3.5" />
                      </Button>
                    )}
                    {podeGerir && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Nova versão"
                          title="Enviar nova versão"
                          disabled={busy}
                          onClick={() => {
                            setAlvoVersao(d.id);
                            fileVersaoRef.current?.click();
                          }}
                        >
                          <History className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => remover(d.id)} disabled={pending}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {podeGerir && (
            <div className="flex items-center gap-2">
              <Input ref={fileRef} type="file" multiple className="text-xs" />
              <Button size="sm" variant="outline" onClick={enviar} disabled={busy}>
                <Upload className="size-3.5" /> {busy ? "Enviando…" : "Enviar"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* C3 — Comparar versões */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Comparar versões</CardTitle>
          <CardDescription>Diferença de itens e valor entre duas versões.</CardDescription>
        </CardHeader>
        <CardContent>
          {versoes.length < 2 ? (
            <p className="text-sm text-muted-foreground">Necessário ao menos 2 versões.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Select value={a} onValueChange={(v) => setA(v ?? a)}>
                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{versoes.map((v) => (<SelectItem key={v.numero} value={String(v.numero)}>v{v.numero}</SelectItem>))}</SelectContent>
                </Select>
                <span className="text-muted-foreground">→</span>
                <Select value={b} onValueChange={(v) => setB(v ?? b)}>
                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{versoes.map((v) => (<SelectItem key={v.numero} value={String(v.numero)}>v{v.numero}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              {va && vb && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[va, vb].map((v, i) => (
                    <div key={i} className="rounded-sm border p-2">
                      <p className="mb-1 font-mono uppercase tracking-wide text-muted-foreground">v{v.numero} · {formatarData(v.data)}</p>
                      <ul className="space-y-0.5">
                        {v.itens.map((it, j) => (
                          <li key={j} className="flex justify-between gap-2">
                            <span className="truncate">{it.disciplina}</span>
                            <span className="font-mono">{brl(it.valor)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 flex justify-between border-t pt-1 font-mono font-semibold">
                        <span>Total</span><span>{brl(v.total)}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {va && vb && (
                <p className={`text-center font-mono text-sm font-semibold ${vb.total - va.total >= 0 ? "text-success" : "text-destructive"}`}>
                  Δ {brl(vb.total - va.total)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
