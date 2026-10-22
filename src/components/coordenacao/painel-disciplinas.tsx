"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, Loader2, Lightbulb, ChevronDown, Eye, EyeOff } from "lucide-react";
import type { ModeloRow } from "@/components/coordenacao/conversao-status-view";
import { definirModeloNaCompatibilizacao } from "@/modules/coordenacao/actions";
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
 * Quem gerencia a coordenação tira um modelo da Compatibilização (o olho riscado): ele vai para
 * "Fora da compatibilização", no fim do painel, de onde volta. Um oculto que está na cena (aberto
 * por um apontamento) continua na lista até ser desligado.
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
  const [foraAberto, setForaAberto] = useState(false);
  const [alterando, setAlterando] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  const naLista = modelos.filter((m) => !m.oculto || carregados.has(m.uploadId));
  const foraDaLista = modelos.filter((m) => m.oculto && !carregados.has(m.uploadId));
  const convertidosNaLista = naLista.filter((m) => m.conversao?.status === "concluido").length;

  function definir(m: ModeloRow, incluir: boolean) {
    setAlterando(m.uploadId);
    start(async () => {
      if (!incluir && carregados.has(m.uploadId)) onToggle(m.uploadId, false);
      const r = await definirModeloNaCompatibilizacao({ projetoId, modeloId: m.uploadId, incluir });
      if (r.ok) {
        toast.success(
          incluir
            ? `${m.nomeArquivo} voltou para a compatibilização.`
            : `${m.nomeArquivo} saiu da compatibilização. Ele continua na aba Arquivos.`,
        );
        router.refresh();
      } else {
        toast.error(r.error);
      }
      setAlterando(null);
    });
  }

  function botaoOcultar(m: ModeloRow) {
    if (!podeGerir) return null;
    if (alterando === m.uploadId) return <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />;
    return (
      <Button
        size="icon"
        variant="ghost"
        className="size-7 text-muted-foreground"
        aria-label={
          m.oculto
            ? `Incluir ${m.nomeArquivo} de volta na compatibilização`
            : `Tirar ${m.nomeArquivo} da compatibilização`
        }
        title={
          m.oculto
            ? "Incluir de volta na compatibilização"
            : "Tirar da compatibilização (some deste painel, do diff e do IFC federado; continua na aba Arquivos)"
        }
        disabled={alterando !== null}
        onClick={() => definir(m, m.oculto)}
      >
        {m.oculto ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </Button>
    );
  }

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
              {carregados.size} de {convertidosNaLista} na cena
            </span>
          </CardTitle>
        </button>
      </CardHeader>
      <CardContent className={cn("space-y-3", !aberto && "hidden")}>
        {naLista.map((m) => {
          const convertido = m.conversao?.status === "concluido";
          const estaCarregando = carregando.has(m.uploadId);
          return (
            <div key={m.uploadId} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.disciplinaNome}</p>
                <p className="truncate font-mono text-xs text-muted-foreground" title={m.nomeArquivo}>
                  {m.nomeArquivo} · {rotuloRevisao(m.versao)}
                </p>
                {m.oculto && <p className="text-xs text-muted-foreground">Fora da compatibilização</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {botaoOcultar(m)}
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
            </div>
          );
        })}
        {naLista.length === 0 && (
          <p className="text-sm text-muted-foreground">Todos os modelos estão fora da compatibilização.</p>
        )}
        {foraDaLista.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setForaAberto((v) => !v)}
              className="flex w-full items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={foraAberto}
            >
              <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", !foraAberto && "-rotate-90")} />
              Fora da compatibilização ({foraDaLista.length})
            </button>
            {foraAberto &&
              foraDaLista.map((m) => (
                <div key={m.uploadId} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-muted-foreground">
                    <p className="truncate text-sm">{m.disciplinaNome}</p>
                    <p className="truncate font-mono text-xs" title={m.nomeArquivo}>
                      {m.nomeArquivo} · {rotuloRevisao(m.versao)}
                    </p>
                  </div>
                  {botaoOcultar(m)}
                </div>
              ))}
          </div>
        )}
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
