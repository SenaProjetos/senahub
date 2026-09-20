"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSetParams } from "@/lib/use-set-param";
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
import { GripVertical, CalendarClock } from "lucide-react";
import type { StatusProspeccao } from "@/generated/prisma/client";
import { moverProspeccao } from "@/modules/comercial/actions";
import type { ColunaProspeccao, LeadProspeccao } from "@/modules/comercial/queries";
import { STATUS_PROSPECCAO_LABEL } from "@/modules/comercial/prospeccao";
import { TIPO_PROXIMA_ACAO_LABEL } from "@/modules/agenda/proxima-acao";
import {
  TEMPERATURA_CLASS,
  TEMPERATURA_ICONE,
  TEMPERATURA_LABEL,
  ehTemperatura,
} from "@/modules/comercial/temperatura";
import { diasSemInteracao, followUpAtrasado } from "@/modules/comercial/frescor";
import { RegistrarInteracaoPopover } from "@/components/comercial/registrar-interacao-popover";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { copiarTexto } from "@/lib/clipboard";
import {
  ACAO_COPIAR_NOME,
  destinoDoMover,
  destinosDeProspeccao,
  itensDeCardQuadro,
} from "@/modules/comercial/acoes-quadro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { brlInteiro } from "@/lib/utils";

/**
 * Kanban de Prospecção (F2.13) — agrupado por `status`, não por `FunilEtapa` (deprecado na F2.3).
 *
 * **Movimento otimista com rollback.** O card muda de coluna na hora, e só volta se o servidor
 * recusar. É a diferença que o aceite pede: o board antigo esperava a resposta e chamava
 * `router.refresh()`, então arrastar com a rede ruim dava a impressão de que nada aconteceu.
 *
 * O estado local (`movidos`) guarda só os cards MOVIDOS desde o último carregamento, sobrepondo o
 * status vindo do servidor. Assim o `router.refresh()` de sucesso reconcilia sozinho, e um erro
 * simplesmente remove a sobreposição — o card volta para onde estava, sem precisar guardar cópia
 * do board inteiro.
 */
export function ProspeccaoBoard({
  colunas,
  pagina,
}: {
  colunas: ColunaProspeccao[];
  pagina: number;
}) {
  const router = useRouter();
  const setParams = useSetParams();
  const [, start] = useTransition();
  const [arrastando, setArrastando] = useState<LeadProspeccao | null>(null);
  /** leadId → status otimista. Sobrepõe o que veio do servidor até a próxima leitura. */
  const [movidos, setMovidos] = useState<Record<string, StatusProspeccao>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const agora = useMemo(() => new Date(), []);

  const colunasExibidas = useMemo(() => {
    const todos = colunas.flatMap((c) => c.leads);
    return colunas.map((c) => {
      const leads = todos.filter((l) => (movidos[l.id] ?? l.status) === c.status);
      return { ...c, leads, total: c.total + leads.length - c.leads.length };
    });
  }, [colunas, movidos]);

  function onDragStart(e: DragStartEvent) {
    const lead = colunas.flatMap((c) => c.leads).find((l) => l.id === e.active.id);
    setArrastando(lead ?? null);
  }

  function mover(leadId: string, destino: StatusProspeccao) {
    const lead = colunas.flatMap((c) => c.leads).find((l) => l.id === leadId);
    if (!lead) return;
    const atual = movidos[leadId] ?? lead.status;
    if (atual === destino) return;

    // Otimista: move já.
    setMovidos((m) => ({ ...m, [leadId]: destino }));

    start(async () => {
      const r = await moverProspeccao({ leadId, para: destino });
      if (r.ok) {
        if (r.data?.qualificada) toast.success("Prospecção qualificada — negociação criada.");
        router.refresh();
      } else {
        // Rollback: tira a sobreposição e o card volta sozinho para a coluna de origem.
        setMovidos((m) => {
          const resto = { ...m };
          delete resto[leadId];
          return resto;
        });
        toast.error(r.error);
      }
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setArrastando(null);
    if (!e.over) return;
    mover(String(e.active.id), String(e.over.id) as StatusProspeccao);
  }

  const temMais = colunas.some((coluna) => coluna.temMais);

  return (
    <>
      <DicaMenuContexto />
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {/* F2.17: em tela pequena as colunas EMPILHAM (flex-col) e ocupam a largura toda —
            sem scroll horizontal, que é o aceite. A partir de `sm` volta a ser board lado a lado.
            Feito por CSS e não por media query em JS de propósito: `useMediaQuery` renderiza o
            layout errado no servidor e corrige depois da hidratação, fazendo o board piscar. */}
        <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:overflow-x-auto">
          {colunasExibidas.map((c) => (
            <Coluna
              key={c.status}
              status={c.status}
              leads={c.leads}
              total={c.total}
              agora={agora}
              onMover={mover}
            />
          ))}
        </div>
        <DragOverlay>
          {arrastando ? <Card lead={arrastando} agora={agora} arrastandoOverlay /> : null}
        </DragOverlay>
      </DndContext>
      {temMais && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setParams({ page: String(pagina + 1) })}>
            Carregar mais prospecções
          </Button>
        </div>
      )}
    </>
  );
}

function Coluna({
  status,
  leads,
  total,
  agora,
  onMover,
}: {
  status: StatusProspeccao;
  leads: LeadProspeccao[];
  total: number;
  agora: Date;
  onMover: (leadId: string, destino: StatusProspeccao) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-full shrink-0 flex-col rounded-sm border p-2 transition-colors sm:w-64 ${
        isOver ? "border-primary bg-primary/5" : "border-border/60"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{STATUS_PROSPECCAO_LABEL[status]}</span>
        {/* Total real da coluna no banco; a lista abaixo pode estar paginada. */}
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {total}
        </Badge>
      </div>
      <div className="space-y-2">
        {leads.length === 0 ? (
          <p className="px-1 py-4 text-center text-[11px] text-muted-foreground/60">—</p>
        ) : (
          leads.map((l) => <Card key={l.id} lead={l} agora={agora} onMover={onMover} />)
        )}
      </div>
    </div>
  );
}

function Card({
  lead,
  agora,
  arrastandoOverlay,
  onMover,
}: {
  lead: LeadProspeccao;
  agora: Date;
  arrastandoOverlay?: boolean;
  onMover?: (leadId: string, destino: StatusProspeccao) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  // No toque, soltar o dedo depois do toque longo ainda dispara o `click` do link — sem esta trava
  // o menu abriria junto com a navegação para o lead.
  const menuAberto = useRef(false);
  const nome = lead.cliente?.nome ?? lead.nome;
  const itens = arrastandoOverlay
    ? []
    : itensDeCardQuadro({ href: `/comercial/${lead.id}`, destinos: destinosDeProspeccao(lead.status) });

  async function aoSelecionar(item: AcaoItemAcao) {
    const destino = destinoDoMover(item.id);
    if (destino) onMover?.(lead.id, destino as StatusProspeccao);
    else if (item.id === ACAO_COPIAR_NOME) {
      if (await copiarTexto(nome)) toast.success("Copiado.");
      else toast.error("Não foi possível copiar.");
    }
  }
  const dias = diasSemInteracao(new Date(lead.updatedAt), agora);
  const atrasado = lead.proximaAcao
    ? followUpAtrasado(new Date(lead.proximaAcao.inicio), agora)
    : false;

  return (
    <div
      ref={arrastandoOverlay ? undefined : setNodeRef}
      className={`rounded-sm border bg-card p-2 text-sm ${
        isDragging && !arrastandoOverlay ? "opacity-40" : ""
      }`}
    >
      <LinhaComMenu
        itens={itens}
        onSelect={(item) => void aoSelecionar(item)}
        aoAbrir={(aberto) => {
          menuAberto.current = aberto;
        }}
        render={<div className="flex items-start gap-1.5 rounded-sm data-[popup-open]:bg-muted/50" />}
      >
        {!arrastandoOverlay && (
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none text-muted-foreground"
            aria-label={`Arrastar ${lead.nome}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {!arrastandoOverlay && (
            <div className="float-right ml-1 flex items-center gap-0.5">
              <RegistrarInteracaoPopover entidadeTipo="LEAD" entidadeId={lead.id} />
              <BotaoAcoes
                itens={itens}
                onSelect={(item) => void aoSelecionar(item)}
                rotulo={`Ações de ${nome}`}
                className="size-6"
              />
            </div>
          )}
          {!arrastandoOverlay ? (
            <Link
              href={`/comercial/${lead.id}`}
              onClick={(e) => {
                if (menuAberto.current) e.preventDefault();
              }}
              className="block rounded-sm outline-none underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="truncate font-medium">{lead.cliente?.nome ?? lead.nome}</p>
              <p className="truncate text-xs text-muted-foreground">
                {lead.origemDetalhada ?? lead.nome}
              </p>
            </Link>
          ) : (
            <>
              <p className="truncate font-medium">{lead.cliente?.nome ?? lead.nome}</p>
              <p className="truncate text-xs text-muted-foreground">
                {lead.origemDetalhada ?? lead.nome}
              </p>
            </>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {lead.valorEstimado != null && (
              <span className="font-mono text-xs">{brlInteiro(lead.valorEstimado)}</span>
            )}
            {ehTemperatura(lead.temperatura) && (
              <Badge
                variant="outline"
                className={`text-[10px] ${TEMPERATURA_CLASS[lead.temperatura]}`}
                title={`Temperatura: ${TEMPERATURA_LABEL[lead.temperatura]}`}
              >
                {TEMPERATURA_ICONE[lead.temperatura]} {TEMPERATURA_LABEL[lead.temperatura]}
              </Badge>
            )}
            {/* Dias parados: só aparece a partir de 3 dias, senão todo card teria a etiqueta e
                ela deixaria de chamar atenção justamente onde importa. */}
            {dias != null && dias >= 3 && (
              <span className="font-mono text-[10px] text-muted-foreground" title="Dias sem movimentação">
                {dias}d
              </span>
            )}
          </div>

          {lead.proximaAcao && (
            <p
              className={`mt-1 flex items-center gap-1 truncate text-[10px] ${
                atrasado ? "text-destructive" : "text-muted-foreground"
              }`}
              title={lead.proximaAcao.titulo}
            >
              <CalendarClock className="size-3 shrink-0" />
              {lead.proximaAcao.tipo ? TIPO_PROXIMA_ACAO_LABEL[lead.proximaAcao.tipo] : "Ação"}
              {atrasado ? " · atrasada" : ""}
            </p>
          )}
          {!lead.proximaAcao && (
            <p className="mt-1 text-[10px] text-warning" title="Sem próxima ação marcada">
              sem próxima ação
            </p>
          )}
        </div>
      </LinhaComMenu>
    </div>
  );
}

export function ProspeccaoVazia() {
  return (
    <EmptyState
      icon={CalendarClock}
      title="Nenhuma prospecção ativa"
      description="Crie um lead no funil para começar."
    />
  );
}
