"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { HomeComercialDados } from "@/modules/comercial/queries";
import { AcaoLinha, type ItemAcao } from "./acao-linha";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brlInteiro } from "@/lib/utils";

/**
 * Home do Comercial / Meu Dia (F6.5, P16). Substitui o Kanban de prospecção como tela inicial —
 * prospecção já tem rota própria (`/comercial/prospeccao`). "Meus × todos" (item 3 do P16) fica
 * pra F6.6: aqui a Home mostra a operação inteira, sem alternância ainda.
 *
 * Pipeline aberto/ponderado são FOTO (estoque), não fluxo — não há snapshot histórico no schema
 * pra comparar "pipeline de hoje" com "pipeline de 30 dias atrás", então esses dois cards não têm
 * comparação (decisão registrada no `06-progresso.md`, não esquecimento).
 */
export function HomeComercialView({ dados }: { dados: HomeComercialDados }) {
  const { cards, meuDia } = dados;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CardValor
          titulo="Contratado no mês"
          valor={brlInteiro(cards.contratadoMes.atual)}
          delta={deltaPct(cards.contratadoMes.atual, cards.contratadoMes.anterior)}
          href="/comercial/funil"
        />
        <CardValor
          titulo="Contratos fechados"
          valor={String(cards.contratosFechados.atual)}
          delta={deltaPct(cards.contratosFechados.atual, cards.contratosFechados.anterior)}
          href="/comercial/funil"
        />
        <CardValor
          titulo="Ticket médio"
          valor={cards.ticketMedio.atual != null ? brlInteiro(cards.ticketMedio.atual) : "—"}
          delta={deltaPct(cards.ticketMedio.atual, cards.ticketMedio.anterior)}
          href="/comercial/funil"
        />
        <CardValor
          titulo="Pipeline aberto"
          valor={brlInteiro(cards.pipelineAberto)}
          href="/comercial/funil"
        />
        <CardValor
          titulo="Pipeline ponderado"
          valor={brlInteiro(cards.pipelinePonderado)}
          href="/comercial/funil"
        />
        <CardValor
          titulo="Follow-ups hoje"
          valor={String(cards.followUpsHoje)}
          href="#meu-dia"
        />
        <CardValor
          titulo="Follow-ups atrasados"
          valor={String(cards.followUpsAtrasados)}
          href="#meu-dia"
          alerta={cards.followUpsAtrasados > 0}
        />
      </div>

      <div id="meu-dia" className="space-y-3">
        <h3 className="text-lg font-bold tracking-tight">Meu Dia</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <ListaAcoes titulo="Follow-ups atrasados" itens={meuDia.followUpsAtrasados} vazio="Nenhum follow-up atrasado 🎉" />
          <ListaAcoes titulo="Contatos para hoje" itens={meuDia.contatosHoje} vazio="Nada agendado para hoje" />
          <ListaAcoes titulo="Próximas ações" itens={meuDia.proximasAcoes} vazio="Nada agendado no horizonte configurado" />
          <ListaSimples
            titulo="Propostas aguardando retorno"
            itens={meuDia.propostasAguardandoRetorno.map((p) => ({
              id: p.id,
              texto: `${p.numero} — ${p.clienteNome}`,
              href: p.href,
            }))}
            vazio="Nenhuma proposta aguardando retorno"
          />
          <ListaSimples
            titulo="Propostas perto do vencimento"
            itens={meuDia.propostasPertoDoVencimento.map((p) => ({
              id: p.id,
              texto: `${p.numero} — ${p.clienteNome} (${p.dias === 0 ? "vence hoje" : `${p.dias}d`})`,
              href: p.href,
            }))}
            vazio="Nenhuma proposta perto de vencer"
          />
          <ListaSimples
            titulo="Sem contato há muitos dias"
            itens={meuDia.oportunidadesSemContato.map((n) => ({
              id: n.id,
              texto: `${n.clienteNome} — ${n.titulo} (${n.diasSemContato}d)`,
              href: n.href,
            }))}
            vazio="Nenhuma negociação parada"
          />
        </div>
      </div>
    </div>
  );
}

function deltaPct(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

function CardValor({
  titulo,
  valor,
  delta,
  href,
  alerta,
}: {
  titulo: string;
  valor: string;
  delta?: number | null;
  href: string;
  alerta?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <Card className={alerta ? "border-destructive/50" : undefined}>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          <p className={`mt-1 text-xl font-bold ${alerta ? "text-destructive" : ""}`}>{valor}</p>
          {delta != null && (
            <p
              className={`mt-0.5 flex items-center gap-1 text-xs ${delta >= 0 ? "text-success" : "text-destructive"}`}
            >
              {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {Math.abs(delta).toFixed(0)}% vs mês anterior
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function ListaAcoes({ titulo, itens, vazio }: { titulo: string; itens: ItemAcao[]; vazio: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {itens.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">{vazio}</p>
        ) : (
          itens.map((it) => <AcaoLinha key={it.id} item={it} />)
        )}
      </CardContent>
    </Card>
  );
}

function ListaSimples({
  titulo,
  itens,
  vazio,
}: {
  titulo: string;
  itens: { id: string; texto: string; href: string }[];
  vazio: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {itens.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">{vazio}</p>
        ) : (
          itens.map((it) => (
            <Link
              key={it.id}
              href={it.href}
              className="block truncate rounded-sm border px-2 py-1.5 text-sm hover:bg-muted"
            >
              {it.texto}
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
