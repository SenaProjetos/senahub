"use client";

import { useState } from "react";
import {
  Maximize,
  Scissors,
  Focus,
  EyeOff,
  Eye,
  X,
  Layers,
  ListTree,
  AlertTriangle,
  GitCompare,
  ClipboardList,
  Info,
  Bookmark,
  Ruler,
} from "lucide-react";
import type { CorteConfig, EixoCorte } from "@/modules/coordenacao/viewer/engine";
import { Badge } from "@/components/ui/badge";
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

/** Painéis que abrem no dock flutuante do viewer, um de cada vez. */
export type PainelId = "disciplinas" | "elementos" | "clash" | "diff" | "apontamentos" | "propriedades" | "vistas";

function BotaoTool({
  label,
  onClick,
  disabled,
  ativo,
  badge,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  ativo?: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={ativo ? "default" : "secondary"}
            size="icon"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-pressed={ativo}
            className="relative"
          >
            {children}
            {!!badge && badge > 0 && (
              <Badge className="absolute -right-1.5 -top-1.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
                {badge}
              </Badge>
            )}
          </Button>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Toolbar flutuante do viewer (canto superior esquerdo): enquadrar, corte,
 * isolar/ocultar/mostrar, limpar seleção — e o menu que abre os painéis (Disciplinas,
 * Elementos, Clash, Diff, Apontamentos, Propriedades, Vistas) no dock flutuante, mais
 * o toggle da medição. Só um painel fica ativo por vez (estilo abas).
 */
export function ViewerToolbar({
  temSelecao,
  corte,
  onEnquadrar,
  onCorte,
  onIsolar,
  onOcultar,
  onMostrarTudo,
  onLimparSelecao,
  painelAtivo,
  onTogglePainel,
  painelDesabilitado,
  apontamentosAbertos = 0,
  medicaoAberta,
  onToggleMedicao,
}: {
  temSelecao: boolean;
  corte: CorteConfig;
  onEnquadrar: () => void;
  onCorte: (config: CorteConfig) => void;
  onIsolar: () => void;
  onOcultar: () => void;
  onMostrarTudo: () => void;
  onLimparSelecao: () => void;
  painelAtivo: PainelId | null;
  onTogglePainel: (id: PainelId) => void;
  painelDesabilitado?: Partial<Record<PainelId, boolean>>;
  apontamentosAbertos?: number;
  medicaoAberta: boolean;
  onToggleMedicao: () => void;
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

      <div className="mx-1 h-5 w-px bg-border" />

      <BotaoTool
        label="Disciplinas"
        ativo={painelAtivo === "disciplinas"}
        onClick={() => onTogglePainel("disciplinas")}
      >
        <Layers className="size-4" />
      </BotaoTool>
      <BotaoTool
        label="Elementos"
        ativo={painelAtivo === "elementos"}
        disabled={painelDesabilitado?.elementos}
        onClick={() => onTogglePainel("elementos")}
      >
        <ListTree className="size-4" />
      </BotaoTool>
      <BotaoTool
        label="Detecção de conflitos"
        ativo={painelAtivo === "clash"}
        disabled={painelDesabilitado?.clash}
        onClick={() => onTogglePainel("clash")}
      >
        <AlertTriangle className="size-4" />
      </BotaoTool>
      <BotaoTool
        label="Comparar versões"
        ativo={painelAtivo === "diff"}
        disabled={painelDesabilitado?.diff}
        onClick={() => onTogglePainel("diff")}
      >
        <GitCompare className="size-4" />
      </BotaoTool>
      <BotaoTool
        label="Apontamentos"
        ativo={painelAtivo === "apontamentos"}
        badge={apontamentosAbertos}
        onClick={() => onTogglePainel("apontamentos")}
      >
        <ClipboardList className="size-4" />
      </BotaoTool>
      <BotaoTool
        label="Propriedades do elemento"
        ativo={painelAtivo === "propriedades"}
        disabled={painelDesabilitado?.propriedades}
        onClick={() => onTogglePainel("propriedades")}
      >
        <Info className="size-4" />
      </BotaoTool>
      <BotaoTool label="Vistas salvas" ativo={painelAtivo === "vistas"} onClick={() => onTogglePainel("vistas")}>
        <Bookmark className="size-4" />
      </BotaoTool>

      <div className="mx-1 h-5 w-px bg-border" />

      <BotaoTool label="Medição" ativo={medicaoAberta} onClick={onToggleMedicao}>
        <Ruler className="size-4" />
      </BotaoTool>
    </div>
  );
}
