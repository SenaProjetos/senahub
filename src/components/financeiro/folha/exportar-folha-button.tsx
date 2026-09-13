"use client";

import { useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * CSV/XLSX da folha, respeitando o filtro/ordenação ativos (F7) — a rota lê os MESMOS
 * search params da tela (`useSearchParams` aqui é só pra repassá-los, nunca reconstrói o
 * filtro). `<a>`, não `fetch`+blob: é download simples, sem token nem POST — deixar o
 * navegador tratar como qualquer link de arquivo.
 */
export function ExportarFolhaButton() {
  const sp = useSearchParams();

  function href(formato: "csv" | "xlsx") {
    const params = new URLSearchParams(sp);
    params.set("formato", formato);
    return `/api/financeiro/folha-projetistas/export?${params.toString()}`;
  }

  return (
    <div className="ml-auto flex gap-2">
      <Button variant="outline" size="sm" render={<a href={href("xlsx")} />}>
        <FileSpreadsheet className="size-4" /> XLSX
      </Button>
      <Button variant="outline" size="sm" render={<a href={href("csv")} />}>
        <Download className="size-4" /> CSV
      </Button>
    </div>
  );
}
