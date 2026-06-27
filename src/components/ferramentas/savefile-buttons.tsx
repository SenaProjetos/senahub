"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { serializar, parse } from "@/modules/ferramentas/savefile";

type Props = {
  ferramenta: string;
  versaoCalc: number;
  titulo: string;
  norma?: string;
  entradas: Record<string, unknown>;
  onImport: (entradas: Record<string, unknown>, titulo: string) => void;
  disabled?: boolean;
};

export function SavefileButtons({ ferramenta, versaoCalc, titulo, norma, entradas, onImport, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const json = serializar({ ferramenta, versaoCalc, titulo, norma, entradas });
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${titulo.replace(/\s+/g, "-").toLowerCase()}.shcalc.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const json = ev.target?.result;
      if (typeof json !== "string") return;
      const result = parse(json, ferramenta);
      if (!result.ok) {
        toast.error(result.erro);
        return;
      }
      onImport(result.data.entradas as Record<string, unknown>, result.data.titulo);
      toast.success(`Cálculo "${result.data.titulo}" carregado.`);
    };
    reader.readAsText(file);
    // Limpa o input para permitir reimportar o mesmo arquivo
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={disabled}
        title="Exportar .shcalc.json"
      >
        <Download className="h-3.5 w-3.5 mr-1.5" />
        Exportar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        title="Importar .shcalc.json"
      >
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        Importar
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.shcalc.json"
        className="hidden"
        onChange={handleImport}
      />
    </div>
  );
}
