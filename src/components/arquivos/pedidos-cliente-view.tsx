"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox, Info, MessageSquareText } from "lucide-react";
import type { PedidoFilaView } from "@/modules/portal/pedido-revisao/queries";
import {
  MOTIVO_REVISAO_SUBSTITUIDA,
  MOTIVO_SEM_VALIDAR,
  itensDoPedido,
  type StatusPedido,
} from "@/modules/portal/pedido-revisao/regras";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { cn, formatarDataHora } from "@/lib/utils";
import { classeDoStatus } from "@/modules/uploads/status-documento";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { EmptyState } from "@/components/ui/empty-state";
import { DecisaoPedidoDialog, type ModoDecisao } from "@/components/arquivos/decisao-pedido-dialog";

/** Motivo para não aceitar que a TELA já sabe (o servidor confere tudo de novo). */
export function motivoNaTela(p: { revisaoSubstituida: boolean }, podeValidar: boolean): string | null {
  if (!podeValidar) return MOTIVO_SEM_VALIDAR;
  if (p.revisaoSubstituida) return MOTIVO_REVISAO_SUBSTITUIDA;
  return null;
}

/** Respondido só teria "Abrir pedido", que a própria linha já faz: sem menu (ADR-0002, regra 1). */
export function itensDaLinhaDoPedido(p: PedidoFilaView, podeValidar: boolean): AcaoItem[] {
  const decisoes = itensDoPedido({ status: p.status, podeAceitar: motivoNaTela(p, podeValidar), podeRecusar: true });
  if (decisoes.length === 0) return [];
  return [{ tipo: "link", id: "abrir", rotulo: "Abrir pedido", href: `/arquivos/pedidos-cliente/${p.id}` }, ...decisoes];
}

/** Cor de cada situação pelos tokens de status do sistema (`classeDoStatus`). */
const COR_STATUS: Record<StatusPedido, string> = { aguardando: "aguardando", aceito: "aprovado", recusado: "perigo", cancelado: "neutro" };

export function SeloStatusPedido({ status, rotulo }: { status: StatusPedido; rotulo: string }) {
  return (
    <span className={cn("shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none", classeDoStatus(COR_STATUS[status]))}>
      {rotulo}
    </span>
  );
}

export function SeloRevisaoSubstituida() {
  return (
    <span className={cn("shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none", classeDoStatus("neutro"))}>
      Revisão substituída
    </span>
  );
}

function LinhaPedido({
  p,
  podeValidar,
  onDecidir,
}: {
  p: PedidoFilaView;
  podeValidar: boolean;
  onDecidir: (p: PedidoFilaView, modo: ModoDecisao) => void;
}) {
  const itens = itensDaLinhaDoPedido(p, podeValidar);
  const onSelect = (item: AcaoItemAcao) => {
    if (item.id === "aceitar" || item.id === "recusar") onDecidir(p, item.id);
  };
  const detalhes = [
    `pedido por ${p.autorNome}`,
    formatarDataHora(p.criadoEm),
    p.marcacoes > 0 ? `${p.marcacoes} ${p.marcacoes === 1 ? "marcação" : "marcações"}` : null,
    p.anexos.length > 0 ? `${p.anexos.length} ${p.anexos.length === 1 ? "anexo" : "anexos"}` : null,
  ].filter(Boolean);
  return (
    <LinhaComMenu itens={itens} onSelect={onSelect} render={<li className="px-3 py-2.5 data-[popup-open]:bg-muted/50" />}>
      <div className="flex items-start gap-2">
        <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/arquivos/pedidos-cliente/${p.id}`} className="min-w-0 max-w-full truncate text-sm font-medium hover:underline">
              {p.prancha}
            </Link>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.revisao}</span>
            {p.status !== "aguardando" && <SeloStatusPedido status={p.status} rotulo={p.rotuloStatus} />}
            {p.revisaoSubstituida && <SeloRevisaoSubstituida />}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{formatarCodigo(p.projeto.codigo)}</span> · {p.projeto.nome}
          </p>
          <p className="text-xs text-muted-foreground">{detalhes.join(" · ")}</p>
          <p className="line-clamp-2 text-sm break-words">{p.comentario}</p>
        </div>
        <BotaoAcoes itens={itens} onSelect={onSelect} rotulo={`Ações do pedido de ${p.prancha}`} className="size-7 shrink-0" />
      </div>
    </LinhaComMenu>
  );
}

/** Fila "Pedidos do cliente": os pedidos de revisão feitos no portal, com aceitar e recusar. */
export function PedidosClienteView({
  pedidos,
  filtro,
  podeValidar,
}: {
  pedidos: PedidoFilaView[];
  filtro: "aguardando" | "respondidos";
  podeValidar: boolean;
}) {
  const [decisao, setDecisao] = useState<{ p: PedidoFilaView; modo: ModoDecisao } | null>(null);

  return (
    <div className="space-y-3">
      <nav className="flex flex-wrap gap-2" aria-label="Situação dos pedidos">
        {(
          [
            ["aguardando", "Aguardando"],
            ["respondidos", "Respondidos"],
          ] as const
        ).map(([valor, rotulo]) => (
          <Link
            key={valor}
            href={valor === "aguardando" ? "/arquivos/pedidos-cliente" : "/arquivos/pedidos-cliente?filtro=respondidos"}
            aria-current={filtro === valor ? "page" : undefined}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              filtro === valor ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {rotulo}
          </Link>
        ))}
      </nav>

      {pedidos.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filtro === "aguardando" ? "Nenhum pedido aguardando" : "Nenhum pedido respondido"}
          description={
            filtro === "aguardando"
              ? "Quando um cliente pedir revisão de uma prancha pelo portal, o pedido aparece aqui."
              : "Os pedidos aceitos, recusados ou cancelados aparecem aqui."
          }
        />
      ) : (
        <>
          {filtro === "aguardando" && <DicaMenuContexto />}
          <ul className="divide-y rounded-lg border bg-card">
            {pedidos.map((p) => (
              <LinhaPedido key={p.id} p={p} podeValidar={podeValidar} onDecidir={(x, modo) => setDecisao({ p: x, modo })} />
            ))}
          </ul>
        </>
      )}

      {!podeValidar && filtro === "aguardando" && pedidos.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {MOTIVO_SEM_VALIDAR}
        </p>
      )}

      <DecisaoPedidoDialog
        key={decisao ? `${decisao.p.id}-${decisao.modo}` : "fechado"}
        pedido={decisao?.p ?? null}
        modo={decisao?.modo ?? null}
        onFechar={() => setDecisao(null)}
      />
    </div>
  );
}
