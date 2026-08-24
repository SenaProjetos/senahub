"use client";

import { useMemo, useState } from "react";
import { ClipboardList, MessageSquare, Paperclip, Plus, Search } from "lucide-react";
import type { PendenciaView } from "@/modules/projetos/pendencias/queries";
import {
  ehRascunho,
  estaAberta,
  SEVERIDADE_LABEL,
  SEVERIDADES,
  STATUS_LABEL,
  STATUS_PENDENCIA,
  TIPO_PENDENCIA_LABEL,
  type Severidade,
  type StatusPendencia,
  type TipoPendencia,
} from "@/modules/projetos/pendencias/helpers";
import { diasAtePrazo, rotuloPrazo, situacaoPrazo } from "@/modules/projetos/pendencias/prazo";
import { formatarData, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PainelTarefasDocumentoProps = {
  /** A mesma coleção mutável de pendências do visualizador; não abre uma segunda consulta. */
  pendencias: PendenciaView[];
  selecionadaId: string | null;
  onSelecionarPendencia: (id: string) => void;
  /** Só quem valida pode enviar a rodada para uma tarefa. */
  podeCriarTarefa: boolean;
  quantidadeSemTarefa: number;
  onCriarTarefa?: () => void;
  pending?: boolean;
};

const SEM_CLASSIFICACAO = "__sem_classificacao";

/**
 * Lista contextual de apontamentos de um documento. A seleção e o envio ficam no pai para que
 * o workspace de três painéis preserve uma única fonte de verdade para pinos e tarefas.
 */
export function PainelTarefasDocumento({
  pendencias,
  selecionadaId,
  onSelecionarPendencia,
  podeCriarTarefa,
  quantidadeSemTarefa,
  onCriarTarefa,
  pending = false,
}: PainelTarefasDocumentoProps) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroSeveridade, setFiltroSeveridade] = useState<string>("todas");

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return pendencias.filter((pendencia) => {
      const correspondeBusca =
        !termo ||
        pendencia.texto.toLocaleLowerCase("pt-BR").includes(termo) ||
        String(pendencia.numero).includes(termo) ||
        pendencia.autor.toLocaleLowerCase("pt-BR").includes(termo);
      const correspondeStatus = filtroStatus === "todos" || pendencia.status === filtroStatus;
      const correspondeSeveridade =
        filtroSeveridade === "todas" ||
        (filtroSeveridade === SEM_CLASSIFICACAO
          ? pendencia.severidade == null
          : pendencia.severidade === filtroSeveridade);
      return correspondeBusca && correspondeStatus && correspondeSeveridade;
    });
  }, [busca, filtroSeveridade, filtroStatus, pendencias]);

  return (
    <aside className="flex min-h-0 w-full flex-col" aria-labelledby="tarefas-documento-titulo">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h2 id="tarefas-documento-titulo" className="truncate text-sm font-semibold">
            Tarefas do documento
          </h2>
          <p className="text-xs text-muted-foreground">{pendencias.length} apontamento(s)</p>
        </div>
        {podeCriarTarefa && onCriarTarefa && (
          <Button
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={onCriarTarefa}
            disabled={pending || quantidadeSemTarefa === 0}
            title="Agrupa os apontamentos abertos sem tarefa em uma nova tarefa"
          >
            <Plus className="size-3.5" /> Tarefa{quantidadeSemTarefa > 0 ? ` (${quantidadeSemTarefa})` : ""}
          </Button>
        )}
      </div>

      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Pesquisar apontamentos"
            aria-label="Pesquisar apontamentos do documento"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={filtroStatus} onValueChange={(valor) => setFiltroStatus(valor ?? "todos")}>
            <SelectTrigger className="h-8 text-xs" aria-label="Filtrar por status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {STATUS_PENDENCIA.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroSeveridade} onValueChange={(valor) => setFiltroSeveridade(valor ?? "todas")}>
            <SelectTrigger className="h-8 text-xs" aria-label="Filtrar por severidade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Toda severidade</SelectItem>
              <SelectItem value={SEM_CLASSIFICACAO}>Sem severidade</SelectItem>
              {SEVERIDADES.map((severidade) => (
                <SelectItem key={severidade} value={severidade}>
                  {SEVERIDADE_LABEL[severidade]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {pendencias.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nenhum apontamento neste documento"
            description="Os apontamentos criados na prancha aparecerão aqui."
            className="px-4"
          />
        ) : filtradas.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nenhum apontamento encontrado"
            description="Ajuste a pesquisa ou os filtros para ver outros apontamentos."
            className="px-4"
          />
        ) : (
          <ul className="divide-y" aria-label="Apontamentos do documento">
            {filtradas.map((pendencia) => {
              const dias = diasAtePrazo(pendencia.prazo, pendencia.publicadoEm);
              const prazo = situacaoPrazo(pendencia, ["fechada", "descartada"]);
              const categoria = pendencia.tipo ? TIPO_PENDENCIA_LABEL[pendencia.tipo as TipoPendencia] ?? pendencia.tipo : null;
              const severidade = pendencia.severidade
                ? SEVERIDADE_LABEL[pendencia.severidade as Severidade] ?? pendencia.severidade
                : null;
              const status = STATUS_LABEL[pendencia.status as StatusPendencia] ?? pendencia.status;
              const selecionada = selecionadaId === pendencia.id;

              return (
                <li key={pendencia.id}>
                  <button
                    type="button"
                    onClick={() => onSelecionarPendencia(pendencia.id)}
                    aria-current={selecionada ? "true" : undefined}
                    className={cn(
                      "w-full px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      selecionada && "bg-muted",
                    )}
                  >
                    <span className="flex items-start gap-2">
                      {pendencia.thumbPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/pendencias/thumb/${pendencia.id}`}
                          alt={`Recorte do apontamento #${pendencia.numero}`}
                          loading="lazy"
                          className="mt-0.5 size-11 shrink-0 rounded-sm border bg-muted object-cover"
                        />
                      ) : (
                        <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-sm border bg-muted text-xs font-semibold tabular-nums">
                          #{pendencia.numero}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold tabular-nums">#{pendencia.numero}</span>
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            {status}
                          </Badge>
                          {ehRascunho(pendencia) && (
                            <Badge variant="outline" className="h-5 border-dashed px-1.5 text-[10px] text-muted-foreground">
                              Rascunho seu
                            </Badge>
                          )}
                        </span>
                        <span className="mt-1 block line-clamp-2 break-words text-xs leading-5 text-foreground">{pendencia.texto}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1">
                          {categoria && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
                              {categoria}
                            </Badge>
                          )}
                          {severidade && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
                              {severidade}
                            </Badge>
                          )}
                          {pendencia.prazo && prazo !== "sem_prazo" && (
                            <Badge
                              variant="outline"
                              className={cn("h-5 px-1.5 text-[10px]", prazo === "vencido" && "border-destructive/40 text-destructive")}
                            >
                              {rotuloPrazo(dias)}
                            </Badge>
                          )}
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>Criado por {pendencia.autor}</span>
                          <span>Pág. {pendencia.pagina}</span>
                          {pendencia.prazo && prazo !== "sem_prazo" && <span>Prazo {formatarData(pendencia.prazo)}</span>}
                          {pendencia.tarefaId ? (
                            <span>Incluído em tarefa</span>
                          ) : estaAberta(pendencia.status) ? (
                            <span>Aguardando envio para tarefa</span>
                          ) : (
                            <span>Sem tarefa vinculada</span>
                          )}
                        </span>
                        {(pendencia.respostas.length > 0 || pendencia.anexos.length > 0) && (
                          <span className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            {pendencia.respostas.length > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <MessageSquare className="size-3" aria-hidden />
                                <span aria-hidden>{pendencia.respostas.length}</span>
                                <span className="sr-only">
                                  {pendencia.respostas.length === 1 ? "1 resposta" : `${pendencia.respostas.length} respostas`}
                                </span>
                              </span>
                            )}
                            {pendencia.anexos.length > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Paperclip className="size-3" aria-hidden />
                                <span aria-hidden>{pendencia.anexos.length}</span>
                                <span className="sr-only">
                                  {pendencia.anexos.length === 1 ? "1 anexo" : `${pendencia.anexos.length} anexos`}
                                </span>
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
