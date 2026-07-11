"use client";

import { Check, Download, Pencil, RotateCcw, Trash2, Undo2 } from "lucide-react";
import type { ApontamentoView } from "@/modules/coordenacao/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  aberta: { label: "Aberta", cls: "text-warning border-warning/40" },
  resolvida: { label: "Resolvida", cls: "text-info border-info/40" },
  fechada: { label: "Fechada", cls: "text-status-aprovado border-status-aprovado/40" },
  descartada: { label: "Descartada", cls: "text-muted-foreground border-muted" },
};

export function ApontamentosLista({
  apontamentos,
  selecionadoId,
  currentUserId,
  ehAdmin,
  podeGerir,
  minhasDisciplinas,
  pending,
  selecaoExport,
  exportando,
  onToggleExport,
  onExportar,
  onSelecionar,
  onEditar,
  onExcluir,
  onResolver,
  onReabrir,
  onFechar,
  onDescartar,
}: {
  apontamentos: ApontamentoView[];
  selecionadoId: string | null;
  currentUserId: string;
  ehAdmin: boolean;
  podeGerir: boolean;
  minhasDisciplinas: Set<string>;
  pending: boolean;
  selecaoExport: Set<string>;
  exportando: boolean;
  onToggleExport: (id: string) => void;
  onExportar: () => void;
  onSelecionar: (a: ApontamentoView) => void;
  onEditar: (a: ApontamentoView) => void;
  onExcluir: (id: string) => void;
  onResolver: (id: string) => void;
  onReabrir: (id: string) => void;
  onFechar: (id: string) => void;
  onDescartar: (id: string) => void;
}) {
  const ordenados = apontamentos.slice().sort((a, b) => a.numero - b.numero);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-sm">
          Apontamentos
          <span className="ml-2 font-normal text-muted-foreground">{apontamentos.length}</span>
        </CardTitle>
        {apontamentos.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={selecaoExport.size === 0 || exportando}
            onClick={onExportar}
            title="Exporta os apontamentos marcados como BCF (abre no Revit/Navisworks)"
          >
            <Download className="size-3.5" /> BCF {selecaoExport.size > 0 && `(${selecaoExport.size})`}
          </Button>
        )}
      </CardHeader>
      <CardContent className="max-h-[45vh] overflow-y-auto p-0">
        {ordenados.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Selecione elementos na maquete e crie o primeiro apontamento.
          </p>
        ) : (
          <ul className="divide-y">
            {ordenados.map((a) => {
              const meta = STATUS_META[a.status] ?? STATUS_META.aberta;
              const sel = selecionadoId === a.id;
              const editavel = (a.autorId === currentUserId || ehAdmin) && a.status === "aberta" && !a.tarefaId;
              const podeResolver = podeGerir || minhasDisciplinas.has(a.disciplinaId) || ehAdmin;
              return (
                <li
                  key={a.id}
                  className={cn("cursor-pointer px-3 py-2 text-sm hover:bg-muted/50", sel && "bg-muted")}
                  onClick={() => onSelecionar(a)}
                >
                  <div className="flex items-center gap-2">
                    <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                      <Checkbox
                        checked={selecaoExport.has(a.id)}
                        onCheckedChange={() => onToggleExport(a.id)}
                        aria-label={`Selecionar apontamento #${a.numero} para exportar`}
                      />
                    </span>
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      {a.numero}
                    </span>
                    <span className="truncate text-xs font-medium">{a.titulo}</span>
                    <Badge variant="outline" className={cn("ml-auto h-5 shrink-0 px-1.5 text-[10px]", meta.cls)}>
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{a.disciplinaNome}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs">{a.texto}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {editavel && (
                      <>
                        <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs" onClick={() => onEditar(a)} disabled={pending}>
                          <Pencil className="size-3" /> editar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-destructive" onClick={() => onExcluir(a.id)} disabled={pending}>
                          <Trash2 className="size-3" /> excluir
                        </Button>
                      </>
                    )}
                    {podeResolver && a.status === "aberta" && (
                      <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-info" onClick={() => onResolver(a.id)} disabled={pending}>
                        <Check className="size-3" /> resolver
                      </Button>
                    )}
                    {podeResolver && a.status === "resolvida" && (
                      <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs" onClick={() => onReabrir(a.id)} disabled={pending}>
                        <Undo2 className="size-3" /> reabrir
                      </Button>
                    )}
                    {podeGerir && a.status !== "fechada" && a.status !== "descartada" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-status-aprovado" onClick={() => onFechar(a.id)} disabled={pending}>
                          <Check className="size-3" /> fechar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground" onClick={() => onDescartar(a.id)} disabled={pending}>
                          <RotateCcw className="size-3" /> descartar
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
