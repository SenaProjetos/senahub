"use client";

import { useState } from "react";
import { Boxes, Loader2, Lightbulb, ChevronDown } from "lucide-react";
import type { ModeloRow } from "@/components/coordenacao/conversao-status-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportarFederadoDialog } from "@/components/coordenacao/exportar-federado-dialog";
import { ModeloFederadoBloco, type GeracaoResumo } from "@/components/coordenacao/modelo-federado-bloco";
import { Switch } from "@/components/ui/switch";
import { cn, rotuloRevisao } from "@/lib/utils";

/**
 * Painel de disciplinas da maquete: liga/desliga cada modelo convertido
 * (carregamento lazy — nada baixa até ligar). Não convertidos aparecem
 * desabilitados com o motivo. O botão de destaque deixa as demais translúcidas.
 */
export function PainelDisciplinas({
  modelos,
  carregados,
  carregando,
  foco,
  onToggle,
  onFocar,
  projetoId,
  podeGerir,
  ultimaGeracao,
}: {
  modelos: ModeloRow[];
  carregados: Set<string>;
  carregando: Set<string>;
  foco: string | null;
  onToggle: (uploadId: string, ligar: boolean) => void;
  onFocar: (uploadId: string) => void;
  projetoId: string;
  podeGerir: boolean;
  ultimaGeracao: GeracaoResumo | null;
}) {
  const [aberto, setAberto] = useState(true);
  const [exportarAberto, setExportarAberto] = useState(false);
  // Foto dos modelos ligados no instante do clique: o diálogo abre com eles marcados.
  const [ligadosNoClique, setLigadosNoClique] = useState<string[]>([]);
  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
          aria-expanded={aberto}
        >
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", !aberto && "-rotate-90")} />
          <CardTitle className="text-sm">
            Disciplinas
            <span className="ml-2 font-normal text-muted-foreground">
              {carregados.size} de {modelos.filter((m) => m.conversao?.status === "concluido").length} na cena
            </span>
          </CardTitle>
        </button>
      </CardHeader>
      <CardContent className={cn("space-y-3", !aberto && "hidden")}>
        {modelos.map((m) => {
          const convertido = m.conversao?.status === "concluido";
          const estaCarregando = carregando.has(m.uploadId);
          return (
            <div key={m.uploadId} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.disciplinaNome}</p>
                <p className="truncate font-mono text-xs text-muted-foreground" title={m.nomeArquivo}>
                  {m.nomeArquivo} · {rotuloRevisao(m.versao)}
                </p>
              </div>
              {convertido ? (
                estaCarregando ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {carregados.has(m.uploadId) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn("size-7", foco === m.uploadId && "text-primary")}
                        aria-label={foco === m.uploadId ? `Remover destaque de ${m.disciplinaNome}` : `Destacar ${m.disciplinaNome}`}
                        title="Destacar esta disciplina (deixa as outras translúcidas)"
                        onClick={() => onFocar(m.uploadId)}
                      >
                        <Lightbulb className="size-4" />
                      </Button>
                    )}
                    <Switch
                      checked={carregados.has(m.uploadId)}
                      onCheckedChange={(v: boolean) => onToggle(m.uploadId, v)}
                      aria-label={`Exibir ${m.disciplinaNome}`}
                    />
                  </div>
                )
              ) : (
                <Badge variant="outline" className="shrink-0">
                  {m.conversao?.status === "erro" ? "Erro na conversão" : "Não convertido"}
                </Badge>
              )}
            </div>
          );
        })}
        <div className="space-y-2 border-t border-border pt-3">
          <ModeloFederadoBloco geracao={ultimaGeracao} />
          {podeGerir && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => {
                setLigadosNoClique([...carregados]);
                setExportarAberto(true);
              }}
            >
              <Boxes className="size-4" aria-hidden /> Exportar IFC federado
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
    {podeGerir && exportarAberto && (
      <ExportarFederadoDialog
        projetoId={projetoId}
        ligados={ligadosNoClique}
        onFechar={() => setExportarAberto(false)}
        desabilitado={
          ultimaGeracao && (ultimaGeracao.status === "fila" || ultimaGeracao.status === "processando")
            ? "Já há uma geração do modelo federado em andamento neste projeto."
            : null
        }
      />
    )}
    </>
  );
}
