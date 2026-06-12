"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, Pencil } from "lucide-react";
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
  projetos,
  usuarios,
}: {
  modeloId: string;
  nome: string;
  fonte: { id: string; label: string; params: ParamFonte[] } | null;
  valores: Record<string, string>;
  projetos: { id: string; label: string }[];
  usuarios: { id: string; label: string }[];
}) {
  const router = useRouter();

  function setParam(id: string, valor: string) {
    const p = new URLSearchParams(valores);
    if (valor) p.set(id, valor);
    else p.delete(id);
    router.push(`/documentos/${modeloId}/preview?${p.toString()}`);
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
          if (p.tipo === "projeto") {
            return (
              <Select key={p.id} value={valores[p.id] ?? ""} onValueChange={(v) => setParam(p.id, v ?? "")}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder={p.label} />
                </SelectTrigger>
                <SelectContent>
                  {projetos.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }
          if (p.tipo === "usuario") {
            return (
              <Select key={p.id} value={valores[p.id] ?? ""} onValueChange={(v) => setParam(p.id, v ?? "")}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder={p.label} />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }
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
        })}

        <Button variant="outline" size="sm" render={<Link href={`/documentos/${modeloId}`} />}>
          <Pencil className="size-4" /> Editar
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Imprimir / PDF
        </Button>
      </div>
    </div>
  );
}
