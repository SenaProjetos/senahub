"use client";

import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CamadaPdf } from "@/components/pdf/use-pdf-camadas";

type Props = {
  grupos: CamadaPdf[];
  onAlternar: (id: string) => void;
};

/**
 * Toggle de camadas/OCG (item 27) — só aparece quando o PDF tem alguma (a maioria não tem;
 * `PdfViewer`/`DocumentoViewer` já filtram por `temCamadas` antes de montar isto).
 */
export function CamadasPdf({ grupos, onAlternar }: Props) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="icon" variant="ghost" className="size-7" aria-label="Camadas do PDF" title="Camadas do PDF">
            <Layers className="size-4" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56 p-2">
        <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">Camadas</p>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {grupos.map((g) => (
            <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
              <Checkbox checked={g.visivel} onCheckedChange={() => onAlternar(g.id)} />
              <Label className="cursor-pointer truncate font-normal">{g.nome}</Label>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
