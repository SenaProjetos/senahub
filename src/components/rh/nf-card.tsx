"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { brl } from "@/lib/utils";

type NF = {
  id: string;
  numero: string | null;
  valor: number;
  status: "enviada" | "aprovada" | "rejeitada";
  observacao: string | null;
  createdAt: string;
};

const CHIP: Record<NF["status"], string> = {
  enviada: "text-warning border-warning/40",
  aprovada: "text-success border-success/40",
  rejeitada: "text-destructive border-destructive/40",
};

export function NfCard({ nfs }: { nfs: NF[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [valor, setValor] = useState("");
  const [numero, setNumero] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(file: File | null) {
    if (!file) return;
    if (!valor || Number(valor) <= 0) {
      toast.error("Informe o valor da nota.");
      return;
    }
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("valor", valor);
      fd.set("numero", numero);
      const res = await fetch("/api/rh/nf", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Falha no envio.");
        return;
      }
      toast.success("Nota fiscal enviada para validação.");
      setValor("");
      setNumero("");
      router.refresh();
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Minhas notas fiscais</CardTitle>
        <CardDescription>Envie sua NF para faturar pagamentos liberados.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed p-3">
          <Input
            placeholder="Nº da nota"
            className="w-32"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
          <Input
            type="number"
            placeholder="Valor (R$)"
            className="w-36"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={enviando}>
            <Upload className="size-3.5" /> {enviando ? "Enviando…" : "Enviar NF"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.xml,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => enviar(e.target.files?.[0] ?? null)}
          />
        </div>

        {nfs.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhuma nota enviada" />
        ) : (
          <ul className="divide-y text-sm">
            {nfs.map((nf) => (
              <li key={nf.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-mono">{brl(nf.valor)}</span>
                  {nf.numero && (
                    <span className="ml-2 text-xs text-muted-foreground">NF {nf.numero}</span>
                  )}
                  {nf.observacao && (
                    <span className="block text-xs text-muted-foreground">{nf.observacao}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={CHIP[nf.status]}>
                    {nf.status}
                  </Badge>
                  <a
                    href={`/api/rh/nf/${nf.id}/download`}
                    className="text-primary"
                    aria-label="Baixar"
                  >
                    <Download className="size-4" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
