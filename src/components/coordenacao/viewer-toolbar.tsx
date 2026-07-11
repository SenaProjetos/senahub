"use client";

import { useState } from "react";
import { Maximize, Scissors, Focus, EyeOff, Eye, X } from "lucide-react";
import type { CorteConfig, EixoCorte } from "@/modules/coordenacao/viewer/engine";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const EIXO_LABEL: Record<EixoCorte, string> = {
  y: "Altura (pavimentos)",
  x: "Eixo X",
  z: "Eixo Z",
};

function BotaoTool({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="secondary" size="icon" onClick={onClick} disabled={disabled} aria-label={label}>
            {children}
          </Button>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Toolbar flutuante do viewer: enquadrar, corte, isolar/ocultar/mostrar, limpar seleção. */
export function ViewerToolbar({
  temSelecao,
  corte,
  onEnquadrar,
  onCorte,
  onIsolar,
  onOcultar,
  onMostrarTudo,
  onLimparSelecao,
}: {
  temSelecao: boolean;
  corte: CorteConfig;
  onEnquadrar: () => void;
  onCorte: (config: CorteConfig) => void;
  onIsolar: () => void;
  onOcultar: () => void;
  onMostrarTudo: () => void;
  onLimparSelecao: () => void;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur">
      <BotaoTool label="Enquadrar modelo" onClick={onEnquadrar}>
        <Maximize className="size-4" />
      </BotaoTool>

      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger
          render={
            <Button variant={corte ? "default" : "secondary"} size="icon" aria-label="Plano de corte">
              <Scissors className="size-4" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-72 space-y-4">
          <p className="text-sm font-medium">Plano de corte</p>
          <div className="space-y-2">
            <Label>Eixo</Label>
            <Select
              value={corte?.eixo ?? ""}
              onValueChange={(v) => {
                const eixo = (v || null) as EixoCorte | null;
                onCorte(eixo ? { eixo, posicao: corte?.posicao ?? 0.5, invertido: corte?.invertido ?? false } : null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem corte" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EIXO_LABEL) as EixoCorte[]).map((e) => (
                  <SelectItem key={e} value={e}>
                    {EIXO_LABEL[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {corte && (
            <>
              <div className="space-y-2">
                <Label>Posição</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(corte.posicao * 100)}
                  onChange={(e) => onCorte({ ...corte, posicao: Number(e.target.value) / 100 })}
                  className="w-full accent-primary"
                  aria-label="Posição do corte"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="corte-invertido">Inverter lado</Label>
                <Switch
                  id="corte-invertido"
                  checked={corte.invertido}
                  onCheckedChange={(v) => onCorte({ ...corte, invertido: v })}
                />
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => onCorte(null)}>
                Remover corte
              </Button>
            </>
          )}
        </PopoverContent>
      </Popover>

      <div className="mx-1 h-5 w-px bg-border" />

      <BotaoTool label="Isolar seleção" onClick={onIsolar} disabled={!temSelecao}>
        <Focus className="size-4" />
      </BotaoTool>
      <BotaoTool label="Ocultar seleção" onClick={onOcultar} disabled={!temSelecao}>
        <EyeOff className="size-4" />
      </BotaoTool>
      <BotaoTool label="Mostrar tudo" onClick={onMostrarTudo}>
        <Eye className="size-4" />
      </BotaoTool>
      <BotaoTool label="Limpar seleção" onClick={onLimparSelecao} disabled={!temSelecao}>
        <X className="size-4" />
      </BotaoTool>
    </div>
  );
}
