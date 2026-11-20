"use client";

import { useState } from "react";
import Link from "next/link";
import { Box, Inbox, Info, MessageSquareText } from "lucide-react";
import type { PedidoFilaView } from "@/modules/portal/pedido-revisao/queries";
import { MOTIVO_SEM_VALIDAR, itensDoPedido } from "@/modules/portal/pedido-revisao/regras";
import { MOTIVO_SEM_COORDENACAO, rotuloDoPedido } from "@/modules/portal/pedido-revisao/modelo-regras";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { cn, formatarDataHora } from "@/lib/utils";
import { SeloIndisponivel, SeloStatusPedido, motivoNaTela, type PoderesNaFila } from "@/components/arquivos/selos-pedido";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { EmptyState } from "@/components/ui/empty-state";
import { DecisaoPedidoDialog, type ModoDecisao } from "@/components/arquivos/decisao-pedido-dialog";

/** Respondido só teria "Abrir pedido", que a própria linha já faz: sem menu (ADR-0002, regra 1). */
export function itensDaLinhaDoPedido(p: PedidoFilaView, poderes: PoderesNaFila): AcaoItem[] {
  // Recusar o pedido de modelo também exige `coordenacao:gerir` (mesma regra da action): sem ela, fica fora do menu.
  const podeRecusar = p.tipo !== "modelo" || poderes.podeCoordenar;
  const decisoes = itensDoPedido({ status: p.status, podeAceitar: motivoNaTela(p, poderes), podeRecusar });
  if (decisoes.length === 0) return [];
  return [{ tipo: "link", id: "abrir", rotulo: "Abrir pedido", href: `/arquivos/pedidos-cliente/${p.id}` }, ...decisoes];
}

function LinhaPedido({
  p,
  poderes,
  onDecidir,
}: {
  p: PedidoFilaView;
  poderes: PoderesNaFila;
  onDecidir: (p: PedidoFilaView, modo: ModoDecisao) => void;
}) {
  const itens = itensDaLinhaDoPedido(p, poderes);
  const ehModelo = p.tipo === "modelo";
  const titulo = rotuloDoPedido(p);
  const Icone = ehModelo ? Box : MessageSquareText;
  const onSelect = (item: AcaoItemAcao) => {
    if (item.id === "aceitar" || item.id === "recusar") onDecidir(p, item.id);
  };
  const detalhes = [
    `pedido por ${p.autorNome}`,
    formatarDataHora(p.criadoEm),
    // No modelo, as marcações já estão no título ("Modelo 3D · N marcações").
    !ehModelo && p.marcacoes > 0 ? `${p.marcacoes} ${p.marcacoes === 1 ? "marcação" : "marcações"}` : null,
    p.anexos.length > 0 ? `${p.anexos.length} ${p.anexos.length === 1 ? "anexo" : "anexos"}` : null,
  ].filter(Boolean);
  return (
    <LinhaComMenu itens={itens} onSelect={onSelect} render={<li className="px-3 py-2.5 data-[popup-open]:bg-muted/50" />}>
      <div className="flex items-start gap-2">
        <Icone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/arquivos/pedidos-cliente/${p.id}`} className="min-w-0 max-w-full truncate text-sm font-medium hover:underline">
              {titulo}
            </Link>
            {p.revisao && <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.revisao}</span>}
            {p.status !== "aguardando" && <SeloStatusPedido status={p.status} rotulo={p.rotuloStatus} />}
            {p.indisponivel && <SeloIndisponivel tipo={p.indisponivel} pedido={p.tipo} />}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{formatarCodigo(p.projeto.codigo)}</span> · {p.projeto.nome}
          </p>
          <p className="text-xs text-muted-foreground">{detalhes.join(" · ")}</p>
          <p className="line-clamp-2 text-sm break-words">{p.comentario}</p>
        </div>
        <BotaoAcoes
          itens={itens}
          onSelect={onSelect}
          rotulo={ehModelo ? "Ações do pedido no modelo 3D" : `Ações do pedido de ${p.prancha}`}
          className="size-7 shrink-0"
        />
      </div>
    </LinhaComMenu>
  );
}

/** Fila "Pedidos do cliente": os pedidos de revisão feitos no portal, com aceitar e recusar. */
export function PedidosClienteView({
  pedidos,
  filtro,
  poderes,
}: {
  pedidos: PedidoFilaView[];
  filtro: "aguardando" | "respondidos";
  poderes: PoderesNaFila;
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
              ? "Quando um cliente pedir revisão de uma prancha ou do modelo 3D pelo portal, o pedido aparece aqui."
              : "Os pedidos aceitos, recusados ou cancelados aparecem aqui."
          }
        />
      ) : (
        <>
          {filtro === "aguardando" && <DicaMenuContexto />}
          <ul className="divide-y rounded-lg border bg-card">
            {pedidos.map((p) => (
              <LinhaPedido key={p.id} p={p} poderes={poderes} onDecidir={(x, modo) => setDecisao({ p: x, modo })} />
            ))}
          </ul>
        </>
      )}

      {filtro === "aguardando" &&
        [
          !poderes.podeValidar && pedidos.some((p) => p.tipo === "prancha") ? MOTIVO_SEM_VALIDAR : null,
          !poderes.podeCoordenar && pedidos.some((p) => p.tipo === "modelo") ? MOTIVO_SEM_COORDENACAO : null,
        ]
          .filter((m): m is string => m !== null)
          .map((m) => (
            <p key={m} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {m}
            </p>
          ))}

      <DecisaoPedidoDialog
        key={decisao ? `${decisao.p.id}-${decisao.modo}` : "fechado"}
        pedido={decisao ? { ...decisao.p, prancha: rotuloDoPedido(decisao.p) } : null}
        modo={decisao?.modo ?? null}
        onFechar={() => setDecisao(null)}
      />
    </div>
  );
}
