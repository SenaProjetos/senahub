"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useDraggable } from "@dnd-kit/core";
import { CalendarClock, GripVertical, RotateCcw, Users } from "lucide-react";
import { reabrirNegociacao } from "@/modules/comercial/actions";
import type { CardFunil } from "@/modules/comercial/queries";
import { ESTAGIO_LABEL } from "@/modules/comercial/jornada";
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
import { ChecklistNegociacaoPopover } from "@/components/comercial/checklist-negociacao-popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brlInteiro } from "@/lib/utils";

export const chaveCard = (c: Pick<CardFunil, "tipo" | "id">) => `${c.tipo}:${c.id}`;

/**
 * Card do board único. O mesmo card é um lead enquanto está na prospecção e a negociação depois
 * de qualificado — os campos mudam com o lado (ADR-0004). Em "Encerrados", mostra o status de
 * origem, porque o grupo junta seis encerramentos diferentes.
 */
export function FunilComercialCard({
  card,
  agora,
  overlay,
  destacado,
  mostrarStatus,
}: {
  card: CardFunil;
  agora: Date;
  overlay?: boolean;
  destacado?: boolean;
  mostrarStatus?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: chaveCard(card) });
  const dias = diasSemInteracao(new Date(card.updatedAt), agora);
  const atrasado = card.proximaAcao ? followUpAtrasado(new Date(card.proximaAcao.inicio), agora) : false;
  const titulo = card.tipo === "LEAD" ? (card.cliente?.nome ?? card.nome) : card.titulo;

  return (
    <div
      id={overlay ? undefined : `card-${card.tipo.toLowerCase()}-${card.id}`}
      ref={overlay ? undefined : setNodeRef}
      className={`rounded-sm border bg-card p-2 text-sm ${
        destacado ? "border-primary ring-2 ring-primary/30" : ""
      } ${isDragging && !overlay ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        {!overlay && (
          <button
            type="button"
            className="mt-0.5 cursor-grab text-muted-foreground"
            aria-label={`Arrastar ${titulo}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {!overlay && <AcoesCard card={card} />}
          {card.tipo === "LEAD" ? <CorpoLead card={card} overlay={overlay} /> : <CorpoNegociacao card={card} />}

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {mostrarStatus && (
              <Badge variant="secondary" className="text-[10px]">
                {card.tipo === "LEAD" ? STATUS_PROSPECCAO_LABEL[card.status] : ESTAGIO_LABEL[card.estagio]}
              </Badge>
            )}
            {card.tipo === "LEAD" && card.valorEstimado != null && (
              <span className="font-mono text-xs">{brlInteiro(card.valorEstimado)}</span>
            )}
            {card.tipo === "NEGOCIACAO" && (card.valorProposto ?? card.valorEstimado) != null && (
              <span className="font-mono text-xs">{brlInteiro((card.valorProposto ?? card.valorEstimado)!)}</span>
            )}
            {card.tipo === "NEGOCIACAO" && (
              <span className="font-mono text-[10px] text-muted-foreground" title="Probabilidade">
                {card.probabilidade}%
              </span>
            )}
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
            {!overlay && card.tipo === "NEGOCIACAO" && card.checklist && (
              <ChecklistNegociacaoPopover negociacaoId={card.id} checklist={card.checklist} />
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            {card.responsavel && (
              <span className="truncate" title={`Responsável: ${card.responsavel.name}`}>
                {card.responsavel.name}
              </span>
            )}
            {card.tipo === "NEGOCIACAO" && card.qtdContatos > 0 && (
              <span className="flex shrink-0 items-center gap-0.5">
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

function CorpoLead({ card, overlay }: { card: Extract<CardFunil, { tipo: "LEAD" }>; overlay?: boolean }) {
  const conteudo = (
    <>
      <p className="truncate font-medium">{card.cliente?.nome ?? card.nome}</p>
      <p className="truncate text-xs text-muted-foreground">{card.origemDetalhada ?? card.nome}</p>
    </>
  );
  if (overlay) return conteudo;
  return (
    <Link
      href={`/comercial/${card.id}`}
      className="block rounded-sm outline-none underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {conteudo}
    </Link>
  );
}

function CorpoNegociacao({ card }: { card: Extract<CardFunil, { tipo: "NEGOCIACAO" }> }) {
  return (
    <>
      <p className="truncate text-xs font-semibold text-muted-foreground">{card.cliente.nome}</p>
      <p className="truncate font-medium">{card.titulo}</p>
    </>
  );
}

function AcoesCard({ card }: { card: CardFunil }) {
  const router = useRouter();
  const [reabrindo, startReabrir] = useTransition();
  // F5.11 — só as negociações encerradas sem contrato; volta sozinha ao estágio anterior.
  const podeReabrir = card.tipo === "NEGOCIACAO" && (card.estagio === "PERDIDO" || card.estagio === "CANCELADO");

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
      <RegistrarInteracaoPopover entidadeTipo={card.tipo} entidadeId={card.id} />
    </div>
  );
}
