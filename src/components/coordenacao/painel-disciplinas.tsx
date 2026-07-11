"use client";

import { Loader2 } from "lucide-react";
import type { ModeloRow } from "@/components/coordenacao/conversao-status-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

/**
 * Painel de disciplinas da maquete: liga/desliga cada modelo convertido
 * (carregamento lazy — nada baixa até ligar). Não convertidos aparecem
 * desabilitados com o motivo.
 */
export function PainelDisciplinas({
  modelos,
  carregados,
  carregando,
  onToggle,
}: {
  modelos: ModeloRow[];
  carregados: Set<string>;
  carregando: Set<string>;
  onToggle: (uploadId: string, ligar: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Disciplinas
          <span className="ml-2 font-normal text-muted-foreground">
            {carregados.size} de {modelos.filter((m) => m.conversao?.status === "concluido").length} na cena
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {modelos.map((m) => {
          const convertido = m.conversao?.status === "concluido";
          const estaCarregando = carregando.has(m.uploadId);
          return (
            <div key={m.uploadId} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.disciplinaNome}</p>
                <p className="truncate font-mono text-xs text-muted-foreground" title={m.nomeArquivo}>
                  {m.nomeArquivo} · v{m.versao}
                </p>
              </div>
              {convertido ? (
                estaCarregando ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <Switch
                    checked={carregados.has(m.uploadId)}
                    onCheckedChange={(v: boolean) => onToggle(m.uploadId, v)}
                    aria-label={`Exibir ${m.disciplinaNome}`}
                  />
                )
              ) : (
                <Badge variant="outline" className="shrink-0">
                  {m.conversao?.status === "erro" ? "Erro na conversão" : "Não convertido"}
                </Badge>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
