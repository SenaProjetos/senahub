"use client";

import { useRef, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useDraggable } from "@dnd-kit/core";
import { CalendarClock, GripVertical, Handshake, Megaphone, RotateCcw, Users } from "lucide-react";
import { reabrirNegociacao } from "@/modules/comercial/actions";
import type { CardFunil } from "@/modules/comercial/queries";
import {
  ACAO_COPIAR_NOME,
  ACAO_REABRIR,
  destinoDoMover,
  destinosDoFunil,
  itensDeCardQuadro,
  negociacaoPodeReabrir,
} from "@/modules/comercial/acoes-quadro";
import { ehColunaFunil, type CardRef, type ColunaFunil } from "@/modules/comercial/funil";
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
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { copiarTexto } from "@/lib/clipboard";
import { brlInteiro } from "@/lib/utils";

export const chaveCard = (c: Pick<CardFunil, "tipo" | "id">) => `${c.tipo}:${c.id}`;

const refDoCard = (c: CardFunil): CardRef =>
  c.tipo === "LEAD" ? { tipo: "LEAD", status: c.status } : { tipo: "NEGOCIACAO", estagio: c.estagio };

/** URL da ficha: a mesma tela do funil + `?card=` — preserva filtros e página. */
function hrefDaFicha(pathname: string, busca: { toString(): string }, card: CardFunil) {
  const p = new URLSearchParams(busca.toString());
  p.set("card", chaveCard(card));
  return `${pathname}?${p.toString()}`;
}

/**
 * Card do board único. O mesmo card é um lead enquanto está na prospecção e a negociação depois
 * de qualificado — os campos mudam com o lado (ADR-0004). Em "Encerrados", mostra o status de
 * origem, porque o grupo junta seis encerramentos diferentes.
 *
 * Menu de contexto e `...` (ADR-0002) saem do mesmo `AcaoItem[]`: Abrir, Mover para, Reabrir e
 * Copiar nome. "Mover para" devolve a decisão ao `onMover` do board — o mesmo ponto por onde o
 * arrasto passa —, para menu e arrasto nunca divergirem de regra.
 */
export function FunilComercialCard({
  card,
  agora,
  overlay,
  destacado,
  mostrarStatus,
  onMover,
}: {
  card: CardFunil;
  agora: Date;
  overlay?: boolean;
  destacado?: boolean;
  mostrarStatus?: boolean;
  onMover?: (card: CardFunil, destino: ColunaFunil) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reabrindo, startReabrir] = useTransition();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: chaveCard(card) });
  // No toque, soltar o dedo depois do toque longo ainda dispara o `click` do link — sem esta trava
  // a ficha abriria junto com o menu.
  const menuAberto = useRef(false);
  const dias = diasSemInteracao(new Date(card.updatedAt), agora);
  const atrasado = card.proximaAcao ? followUpAtrasado(new Date(card.proximaAcao.inicio), agora) : false;
  const titulo = card.tipo === "LEAD" ? (card.cliente?.nome ?? card.nome) : card.titulo;
  const href = hrefDaFicha(pathname, searchParams, card);
  // F5.11 — só as negociações encerradas sem contrato; a action decide o estágio de volta.
  const podeReabrir = card.tipo === "NEGOCIACAO" && negociacaoPodeReabrir(card.estagio);
  // O card arrastado no overlay é uma cópia visual: sem menu, sem botões.
  const itens = overlay
    ? []
    : itensDeCardQuadro({ href, destinos: destinosDoFunil(refDoCard(card)), podeReabrir });

  function reabrir() {
    startReabrir(async () => {
      const r = await reabrirNegociacao({ negociacaoId: card.id });
      if (r.ok) {
        toast.success("Negociação reaberta.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function aoSelecionar(item: AcaoItemAcao) {
    const destino = destinoDoMover(item.id);
    if (destino) {
      if (ehColunaFunil(destino)) onMover?.(card, destino);
    } else if (item.id === ACAO_REABRIR) reabrir();
    else if (item.id === ACAO_COPIAR_NOME) {
      if (await copiarTexto(titulo)) toast.success("Copiado.");
      else toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div
      id={overlay ? undefined : `card-${card.tipo.toLowerCase()}-${card.id}`}
      ref={overlay ? undefined : setNodeRef}
      className={`rounded-sm border bg-card p-2 text-sm ${
        destacado ? "border-primary ring-2 ring-primary/30" : ""
      } ${isDragging && !overlay ? "opacity-40" : ""}`}
    >
      <LinhaComMenu
        itens={itens}
        onSelect={(item) => void aoSelecionar(item)}
        aoAbrir={(aberto) => {
          menuAberto.current = aberto;
        }}
        render={<div className="flex items-start gap-1.5 rounded-sm data-[popup-open]:bg-muted/50" />}
      >
        {!overlay && (
          <button
            type="button"
            // `touch-none`: no celular o gesto na alça arrasta o card em vez de rolar a página.
            className="mt-0.5 cursor-grab touch-none text-muted-foreground"
            aria-label={`Arrastar ${titulo}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {!overlay && (
            <AcoesCard
              card={card}
              titulo={titulo}
              itens={itens}
              onSelect={(item) => void aoSelecionar(item)}
              podeReabrir={podeReabrir}
              reabrindo={reabrindo}
              onReabrir={reabrir}
            />
          )}
          {card.tipo === "LEAD" ? (
            <CorpoLead card={card} href={href} overlay={overlay} menuAberto={menuAberto} />
          ) : (
            <CorpoNegociacao card={card} href={href} overlay={overlay} menuAberto={menuAberto} />
          )}

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {mostrarStatus && (
              <Badge variant="secondary" className="text-[10px]">
                {card.tipo === "LEAD" ? STATUS_PROSPECCAO_LABEL[card.status] : ESTAGIO_LABEL[card.estagio]}
              </Badge>
            )}
            {card.tipo === "LEAD" && card.valorEstimado != null && (
              <span className="font-mono text-xs">{brlInteiro(card.valorEstimado)}</span>
            )}
            {card.tipo === "NEGOCIACAO" && card.valor != null && (
              <span className="font-mono text-xs" title="Valor da proposta vigente (ou estimado, se ainda não há proposta)">
                {brlInteiro(card.valor)}
              </span>
            )}
            {card.tipo === "NEGOCIACAO" && card.desconto != null && card.desconto > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground" title="Desconto concedido">
                −{brlInteiro(card.desconto)}
              </span>
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
            {card.tipo === "LEAD" && card.campanha && (
              <Badge variant="outline" className="max-w-32 truncate text-[10px]" title={`Campanha: ${card.campanha.nome}`}>
                <Megaphone className="size-3 shrink-0" /> {card.campanha.nome}
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
            {card.parceiro && (
              <span className="flex min-w-0 items-center gap-1" title={`Parceiro: ${card.parceiro.nome}`}>
                <Handshake className="size-3 shrink-0" />
                <span className="truncate">{card.parceiro.nome}</span>
              </span>
            )}
            {card.tipo === "NEGOCIACAO" && card.qtdContatos > 0 && (
              <span className="flex shrink-0 items-center gap-0.5">
                <Users className="size-3" /> {card.qtdContatos}
              </span>
            )}
            {/* Só a foto, sem nome — o nome vai no title/alt (leitor de tela e hover). */}
            {card.responsavel && (
              <AvatarUsuario
                nome={card.responsavel.name}
                image={card.responsavel.image}
                size="sm"
                title={`Responsável: ${card.responsavel.name}`}
                className="ml-auto"
              />
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
      </LinhaComMenu>
    </div>
  );
}

/** Propriedades comuns aos dois corpos de card. */
type PropsCorpo = {
  href: string;
  overlay?: boolean;
  /** Trava do toque longo: enquanto o menu está aberto, o clique residual não navega. */
  menuAberto: { current: boolean };
};

function LinkFicha({ href, overlay, menuAberto, children }: PropsCorpo & { children: React.ReactNode }) {
  if (overlay) return <>{children}</>;
  return (
    <Link
      href={href}
      scroll={false}
      onClick={(e) => {
        if (menuAberto.current) e.preventDefault();
      }}
      className="block rounded-sm outline-none underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}

function CorpoLead({ card, ...resto }: PropsCorpo & { card: Extract<CardFunil, { tipo: "LEAD" }> }) {
  return (
    <LinkFicha {...resto}>
      <p className="truncate font-medium">{card.cliente?.nome ?? card.nome}</p>
      <p className="truncate text-xs text-muted-foreground">{card.origemDetalhada ?? card.nome}</p>
    </LinkFicha>
  );
}

function CorpoNegociacao({ card, ...resto }: PropsCorpo & { card: Extract<CardFunil, { tipo: "NEGOCIACAO" }> }) {
  return (
    <LinkFicha {...resto}>
      <p className="truncate text-xs font-semibold text-muted-foreground">{card.cliente.nome}</p>
      <p className="truncate font-medium">{card.titulo}</p>
    </LinkFicha>
  );
}

function AcoesCard({
  card,
  titulo,
  itens,
  onSelect,
  podeReabrir,
  reabrindo,
  onReabrir,
}: {
  card: CardFunil;
  titulo: string;
  itens: readonly AcaoItem[];
  onSelect: (item: AcaoItemAcao) => void;
  podeReabrir: boolean;
  reabrindo: boolean;
  onReabrir: () => void;
}) {
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
          onClick={onReabrir}
        >
          <RotateCcw className="size-3" />
        </Button>
      )}
      <RegistrarInteracaoPopover entidadeTipo={card.tipo} entidadeId={card.id} />
      <BotaoAcoes itens={itens} onSelect={onSelect} rotulo={`Ações de ${titulo}`} className="size-6" />
    </div>
  );
}
