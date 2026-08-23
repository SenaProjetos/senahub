"use client";

import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportarInteligenciaCsvButton() {
  const params = useSearchParams();
  const sufixo = params.size ? `?${params.toString()}` : "";
  return (
    <Button size="sm" variant="outline" render={<a href={`/api/comercial/export/inteligencia${sufixo}`} />}>
      <Download className="size-4" /> Exportar CSV
    </Button>
  );
}
