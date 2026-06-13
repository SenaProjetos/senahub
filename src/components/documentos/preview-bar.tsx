"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Printer, Pencil, Save, FileDown } from "lucide-react";
import { registrarDocumentoGerado } from "@/modules/documentos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ParamFonte } from "@/modules/documentos/fontes-meta";

export function PreviewBar({
  modeloId,
  nome,
  fonte,
  valores,
  opcoes,
}: {
  modeloId: string;
  nome: string;
  fonte: { id: string; label: string; params: ParamFonte[] } | null;
  valores: Record<string, string>;
  /** Opções dos selects por tipo de parâmetro (projeto, cliente, usuario, proposta, licitacao, holerite). */
  opcoes: Record<string, { id: string; label: string }[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function setParam(id: string, valor: string) {
    const p = new URLSearchParams(valores);
    if (valor) p.set(id, valor);
    else p.delete(id);
    router.push(`/documentos/${modeloId}/preview?${p.toString()}`);
  }

  // Pode salvar a geração quando todos os parâmetros da fonte estão preenchidos.
  const podeSalvar = !fonte || fonte.params.every((p) => valores[p.id]);

  function salvarGeracao() {
    start(async () => {
      const r = await registrarDocumentoGerado({ modeloId, params: valores });
      if (r.ok) toast.success("Documento gerado salvo no histórico.");
      else toast.error(r.error);
    });
  }

  return (
    <div className="doc-no-print flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="icon" render={<Link href="/documentos" aria-label="Voltar" />}>
        <ArrowLeft className="size-4" />
      </Button>
      <h2 className="text-lg font-bold tracking-tight">{nome}</h2>
      {fonte && <span className="text-xs text-muted-foreground">· {fonte.label}</span>}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {fonte?.params.map((p) => {
          if (p.tipo === "mes") {
            return (
              <Input
                key={p.id}
                type="month"
                className="w-44"
                value={valores[p.id] ?? ""}
                onChange={(e) => setParam(p.id, e.target.value)}
                aria-label={p.label}
              />
            );
          }
          const lista = opcoes[p.tipo] ?? [];
          return (
            <Select key={p.id} value={valores[p.id] ?? ""} onValueChange={(v) => setParam(p.id, v ?? "")}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder={p.label} />
              </SelectTrigger>
              <SelectContent>
                {lista.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}

        <Button variant="ghost" size="sm" render={<Link href="/documentos/gerados" />}>
          Gerados
        </Button>
        <Button variant="outline" size="sm" render={<Link href={`/documentos/${modeloId}`} />}>
          <Pencil className="size-4" /> Editar
        </Button>
        <Button variant="outline" size="sm" onClick={salvarGeracao} disabled={pending || !podeSalvar}>
          <Save className="size-4" /> {pending ? "Salvando…" : "Salvar geração"}
        </Button>
        {podeSalvar && (
          <Button
            variant="outline"
            size="sm"
            render={
              <a
                href={`/api/documentos/${modeloId}/pdf?${new URLSearchParams(valores).toString()}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <FileDown className="size-4" /> Baixar PDF
          </Button>
        )}
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Imprimir / PDF
        </Button>
      </div>
    </div>
  );
}
