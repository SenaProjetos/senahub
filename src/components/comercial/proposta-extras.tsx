"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import { adicionarAnexoProposta, removerAnexoProposta } from "@/modules/comercial/propostas-extras/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl } from "@/lib/utils";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Anexo = { id: string; nome: string; tamanho: number; createdAt: string };
type Versao = { numero: number; autor: string; data: string; titulo: string; itens: { disciplina: string; valor: number }[]; total: number };

export function PropostaExtras({
  propostaId,
  anexos,
  versoes,
  podeGerir,
}: {
  propostaId: string;
  anexos: Anexo[];
  versoes: Versao[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [a, setA] = useState(versoes.length >= 2 ? String(versoes[1].numero) : versoes[0] ? String(versoes[0].numero) : "");
  const [b, setB] = useState(versoes[0] ? String(versoes[0].numero) : "");
  const va = versoes.find((v) => String(v.numero) === a);
  const vb = versoes.find((v) => String(v.numero) === b);

  async function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/comercial/propostas/anexo", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await adicionarAnexoProposta({ propostaId, meta });
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
  function remover(id: string) {
    start(async () => {
      const r = await removerAnexoProposta({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* C2 — Anexos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Anexos</CardTitle>
          <CardDescription>Arquivos da proposta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {anexos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum anexo.</p>
          ) : (
            <ul className="divide-y rounded-sm border text-sm">
              {anexos.map((an) => (
                <li key={an.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="min-w-0 truncate">{an.nome} <span className="font-mono text-xs text-muted-foreground">{fmtBytes(an.tamanho)}</span></span>
                  <span className="flex items-center">
                    <Button size="icon" variant="ghost" aria-label="Baixar" render={<a href={`/api/comercial/propostas/anexo/${an.id}`} />}>
                      <Download className="size-3.5" />
                    </Button>
                    {podeGerir && (
                      <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => remover(an.id)} disabled={pending}>
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
              <Button size="sm" variant="outline" onClick={enviar} disabled={busy}>
                <Upload className="size-3.5" /> {busy ? "Enviando…" : "Anexar"}
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
                      <p className="mb-1 font-mono uppercase tracking-wide text-muted-foreground">v{v.numero} · {new Date(v.data).toLocaleDateString("pt-BR")}</p>
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
