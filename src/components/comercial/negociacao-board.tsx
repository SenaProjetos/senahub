"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical, CalendarClock, Users, RotateCcw } from "lucide-react";
import type { EstagioNegociacao } from "@/generated/prisma/client";
import { moverEstagioNegociacao, reabrirNegociacao } from "@/modules/comercial/actions";
import type {
  ColunaNegociacao,
  CardNegociacao,
  MotivoPerdaOpcao,
} from "@/modules/comercial/queries";
import { ESTAGIO_LABEL, exigeMotivoPerda } from "@/modules/comercial/jornada";
import { TIPO_PROXIMA_ACAO_LABEL } from "@/modules/agenda/proxima-acao";
import {
  TEMPERATURA_CLASS,
  TEMPERATURA_ICONE,
  TEMPERATURA_LABEL,
  ehTemperatura,
} from "@/modules/comercial/temperatura";
import { diasSemInteracao, followUpAtrasado } from "@/modules/comercial/frescor";
import { MotivoPerdaNegociacaoDialog } from "./motivo-perda-negociacao-dialog";
import { RegistrarInteracaoPopover } from "@/components/comercial/registrar-interacao-popover";
import { ChecklistNegociacaoPopover } from "@/components/comercial/checklist-negociacao-popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brlInteiro } from "@/lib/utils";

/**
 * Kanban de Negociações (F2.14) — o funil que hoje acontece inteiramente fora do sistema.
 *
 * Movimento otimista com rollback, igual ao board de prospecção (F2.13). A diferença é que aqui a
 * transição tem regras de verdade (`jornada.ts`): soltar num destino inválido é recusado pelo
 * servidor com mensagem de negócio, e o card volta.
 *
 * Soltar em **PERDIDO** abre o diálogo de motivo antes de enviar — o motivo é obrigatório
 * (`exigeMotivoPerda`) e sem ele a Fase 6 não teria o que agrupar no relatório "por que
 * perdemos". Pedir depois, num toast de erro, obrigaria a arrastar duas vezes.
 */
export function NegociacaoBoard({
  colunas,
  motivos,
}: {
  colunas: ColunaNegociacao[];
  motivos: MotivoPerdaOpcao[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [arrastando, setArrastando] = useState<CardNegociacao | null>(null);
  const [movidos, setMovidos] = useState<Record<string, EstagioNegociacao>>({});
  /** Movimento pendente que espera o motivo da perda. */
  const [perda, setPerda] = useState<{ id: string; titulo: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const agora = useMemo(() => new Date(), []);

  const colunasExibidas = useMemo(() => {
    const todos = colunas.flatMap((c) => c.cards);
    return colunas.map((c) => {
      const cards = todos.filter((n) => (movidos[n.id] ?? n.estagio) === c.estagio);
      // Contador e soma continuam vindo do BANCO (c.total/c.soma). Só ajusto pelo delta
      // otimista, senão o número piscaria errado até o refresh chegar.
      const delta = cards.length - c.cards.length;
      return { ...c, cards, total: c.total + delta };
    });
  }, [colunas, movidos]);

  function mover(
    id: string,
    destino: EstagioNegociacao,
    motivoPerdaId?: string,
    concorrente?: string,
    observacao?: string,
  ) {
    setMovidos((m) => ({ ...m, [id]: destino }));
    start(async () => {
      const r = await moverEstagioNegociacao({
        negociacaoId: id,
        para: destino,
        motivoPerdaId: motivoPerdaId ?? "",
        concorrente: concorrente ?? "",
        observacao: observacao ?? "",
      });
      if (r.ok) router.refresh();
      else {
        setMovidos((m) => {
          const resto = { ...m };
          delete resto[id];
          return resto;
        });
        toast.error(r.error);
      }
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setArrastando(null);
    const id = String(e.active.id);
    const destino = e.over ? (String(e.over.id) as EstagioNegociacao) : null;
    if (!destino) return;
    const card = colunas.flatMap((c) => c.cards).find((n) => n.id === id);
    if (!card) return;
    if ((movidos[id] ?? card.estagio) === destino) return;

    if (exigeMotivoPerda(destino)) {
      setPerda({ id, titulo: card.titulo });
      return;
    }
    mover(id, destino);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) =>
          setArrastando(colunas.flatMap((c) => c.cards).find((n) => n.id === e.active.id) ?? null)
        }
        onDragEnd={onDragEnd}
      >
        {/* F2.17: mesma regra do board de prospecção — empilha em tela pequena, lado a lado
            a partir de `sm`. Ver comentário lá para o porquê de ser CSS e não JS. */}
        <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:overflow-x-auto">
          {colunasExibidas.map((c) => (
            <Coluna key={c.estagio} coluna={c} agora={agora} />
          ))}
        </div>
        <DragOverlay>
          {arrastando ? <Card card={arrastando} agora={agora} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {perda && (
        <MotivoPerdaNegociacaoDialog
          titulo={perda.titulo}
          motivos={motivos}
          onCancelar={() => setPerda(null)}
          onConfirmar={(motivoPerdaId, concorrente, observacao) => {
            const alvo = perda.id;
            setPerda(null);
            mover(alvo, "PERDIDO", motivoPerdaId, concorrente, observacao);
          }}
        />
      )}
    </>
  );
}

function Coluna({ coluna, agora }: { coluna: ColunaNegociacao; agora: Date }) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.estagio });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-full shrink-0 flex-col rounded-sm border p-2 transition-colors sm:w-72 ${
        isOver ? "border-primary bg-primary/5" : "border-border/60"
      }`}
    >
      <div className="mb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{ESTAGIO_LABEL[coluna.estagio]}</span>
          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
            {coluna.total}
          </Badge>
        </div>
        {coluna.soma > 0 && (
          <p className="font-mono text-[11px] text-muted-foreground">{brlInteiro(coluna.soma)}</p>
        )}
      </div>
      <div className="space-y-2">
        {coluna.cards.length === 0 ? (
          <p className="px-1 py-4 text-center text-[11px] text-muted-foreground/60">—</p>
        ) : (
          coluna.cards.map((n) => <Card key={n.id} card={n} agora={agora} />)
        )}
        {coluna.temMais && (
          <p className="px-1 py-1 text-center text-[10px] text-muted-foreground">
            mostrando {coluna.cards.length} de {coluna.total}
          </p>
        )}
      </div>
    </div>
  );
}

function Card({
  card,
  agora,
  overlay,
}: {
  card: CardNegociacao;
  agora: Date;
  overlay?: boolean;
}) {
  const router = useRouter();
  const [reabrindo, startReabrir] = useTransition();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  const dias = diasSemInteracao(new Date(card.updatedAt), agora);
  const atrasado = card.proximaAcao
    ? followUpAtrasado(new Date(card.proximaAcao.inicio), agora)
    : false;
  const valor = card.valorProposto ?? card.valorEstimado;
  // F5.11 — só nas colunas encerradas; volta ao estágio anterior sozinha, sem perguntar destino.
  const podeReabrir = card.estagio === "PERDIDO" || card.estagio === "CANCELADO";

  function reabrir() {
    startReabrir(async () => {
      const r = await reabrirNegociacao({ negociacaoId: card.id });
      if (r.ok) {
        toast.success("Negociação reaberta.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      className={`rounded-sm border bg-card p-2 text-sm ${isDragging && !overlay ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        {!overlay && (
          <button
            type="button"
            className="mt-0.5 cursor-grab text-muted-foreground"
            aria-label={`Arrastar ${card.titulo}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {!overlay && (
            <div className="float-right ml-1 flex items-center gap-0.5">
              {podeReabrir && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label="Reabrir negociação"
                  title="Reabrir — volta ao estágio anterior"
                  disabled={reabrindo}
                  onClick={reabrir}
                >
                  <RotateCcw className="size-3" />
                </Button>
              )}
              <RegistrarInteracaoPopover entidadeTipo="NEGOCIACAO" entidadeId={card.id} />
            </div>
          )}
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {card.cliente.nome}
          </p>
          <p className="truncate font-medium">{card.titulo}</p>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {valor != null && <span className="font-mono text-xs">{brlInteiro(valor)}</span>}
            <span className="font-mono text-[10px] text-muted-foreground" title="Probabilidade">
              {card.probabilidade}%
            </span>
            {ehTemperatura(card.temperatura) && (
              <Badge
                variant="outline"
                className={`text-[10px] ${TEMPERATURA_CLASS[card.temperatura]}`}
                title={`Temperatura: ${TEMPERATURA_LABEL[card.temperatura]}`}
              >
                {TEMPERATURA_ICONE[card.temperatura]}
              </Badge>
            )}
            {dias != null && dias >= 3 && (
              <span className="font-mono text-[10px] text-muted-foreground" title="Dias sem movimentação">
                {dias}d
              </span>
            )}
            {card.checklist && (
              <ChecklistNegociacaoPopover negociacaoId={card.id} checklist={card.checklist} />
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            {card.responsavel && (
              <span className="truncate" title={`Responsável: ${card.responsavel.name}`}>
                {card.responsavel.name}
              </span>
            )}
            {card.qtdContatos > 0 && (
              <span className="flex items-center gap-0.5 shrink-0">
                <Users className="size-3" /> {card.qtdContatos}
              </span>
            )}
          </div>

          {card.proximaAcao ? (
            <p
              className={`mt-1 flex items-center gap-1 truncate text-[10px] ${
                atrasado ? "text-destructive" : "text-muted-foreground"
              }`}
              title={card.proximaAcao.titulo}
            >
              <CalendarClock className="size-3 shrink-0" />
              {card.proximaAcao.tipo ? TIPO_PROXIMA_ACAO_LABEL[card.proximaAcao.tipo] : "Ação"}
              {atrasado ? " · atrasada" : ""}
            </p>
          ) : (
            <p className="mt-1 text-[10px] text-warning">sem próxima ação</p>
          )}
        </div>
      </div>
    </div>
  );
}
