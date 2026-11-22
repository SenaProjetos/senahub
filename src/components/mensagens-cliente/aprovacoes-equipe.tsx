"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCheck, Paperclip } from "lucide-react";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { cancelarAprovacaoEntrega } from "@/modules/portal/aprovacao-entrega/actions";
import { ACAO_ANULAR, ACAO_CANCELAR, ACAO_REGISTRAR_POR_FORA, hrefDoComprovante, itensDaAprovacao } from "@/modules/portal/aprovacao-entrega/acoes";
import type { AprovacaoDTO, RespostaDTO } from "@/modules/portal/aprovacao-entrega/queries";
import { ROTULO_RESPOSTA } from "@/modules/portal/aprovacao-entrega/regras";
import { EnviarAprovacaoDialog } from "./enviar-aprovacao-dialog";
import { RegistrarRespostaDialog } from "./registrar-resposta-dialog";
import { AnularRespostaDialog } from "./anular-resposta-dialog";

/** Situação em texto (nunca só cor). */
function situacao(a: AprovacaoDTO): string {
  if (a.status === "cancelado") return "Cancelado";
  if (a.status === "aguardando") return a.desatualizado ? "Desatualizado" : "Aguardando";
  const ativa = a.respostas.find((r) => r.anulada === null);
  return ativa ? ROTULO_RESPOSTA[ativa.resposta] : "Respondido";
}

/**
 * Seção "Aprovações de entrega" da aba Cliente (spec 2026-11-22-portal-aprovacao-entrega-design.md): os pacotes enviados
 * ao cliente, a resposta e o que já foi anulado. A página só chega aqui para quem é audiência da conversa com a
 * coordenação; o serviço confere de novo. Menu da linha = mesmo array do `...` (ADR-0002).
 */
export function AprovacoesEquipe({ projetoId, aprovacoes }: { projetoId: string; aprovacoes: AprovacaoDTO[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [registrando, setRegistrando] = useState<AprovacaoDTO | null>(null);
  const [anulando, setAnulando] = useState<{ respostaId: string; titulo: string } | null>(null);
  const [cancelando, startCancelar] = useTransition();

  async function aoEscolher(a: AprovacaoDTO, item: AcaoItemAcao) {
    if (item.id === ACAO_REGISTRAR_POR_FORA) {
      setRegistrando(a);
      return;
    }
    if (item.id === ACAO_ANULAR) {
      const ativa = a.respostas.find((r) => r.anulada === null);
      if (ativa) setAnulando({ respostaId: ativa.id, titulo: a.titulo });
      return;
    }
    if (item.id !== ACAO_CANCELAR || cancelando) return;
    // Confirmar ANTES da transição (ADR-0002, regra 4).
    const ok = await confirm({
      title: item.confirmar?.titulo ?? "Cancelar este pedido?",
      description: item.confirmar?.descricao,
      confirmLabel: item.confirmar?.rotuloConfirmar ?? "Cancelar pedido",
      variant: "destructive",
    });
    if (!ok) return;
    startCancelar(async () => {
      const r = await cancelarAprovacaoEntrega({ aprovacaoId: a.id }).catch(() => null);
      if (!r || !r.ok) {
        toast.error(r?.error ?? "Não foi possível cancelar. Tente de novo.");
        router.refresh();
        return;
      }
      toast.success("Pedido cancelado.");
      router.refresh();
    });
  }

  return (
    <Card id="aprovacoes" className="scroll-mt-20">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden /> Aprovações de entrega
        </CardTitle>
        <EnviarAprovacaoDialog projetoId={projetoId} />
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {aprovacoes.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Nenhum pedido ainda. Envie ao cliente os arquivos das Entregas para ele aprovar formalmente.
          </p>
        ) : (
          <ul className="divide-y">
            {aprovacoes.map((a) => {
              const itens = itensDaAprovacao(a);
              return (
                <LinhaComMenu
                  key={a.id}
                  // Uma ação só: sem menu de contexto, fica o `...` (ADR-0002, regra 4).
                  itens={itens.length > 1 ? itens : []}
                  onSelect={(item) => void aoEscolher(a, item)}
                  render={<li className="flex flex-wrap items-start justify-between gap-2 px-2 py-3" />}
                >
                  <PacoteDaEquipe a={a} />
                  <BotaoAcoes itens={itens} onSelect={(item) => void aoEscolher(a, item)} rotulo={`Ações do pedido ${a.titulo}`} />
                </LinhaComMenu>
              );
            })}
          </ul>
        )}
      </CardContent>
      {registrando && (
        <RegistrarRespostaDialog
          key={registrando.id}
          aprovacaoId={registrando.id}
          titulo={registrando.titulo}
          enviadoEm={registrando.enviadoEm}
          aberto
          onFechar={() => setRegistrando(null)}
        />
      )}
      {anulando && (
        <AnularRespostaDialog
          key={anulando.respostaId}
          respostaId={anulando.respostaId}
          titulo={anulando.titulo}
          aberto
          onFechar={() => setAnulando(null)}
        />
      )}
    </Card>
  );
}

function PacoteDaEquipe({ a }: { a: AprovacaoDTO }) {
  const ativa = a.respostas.find((r) => r.anulada === null) ?? null;
  const anuladas = a.respostas.filter((r) => r.anulada !== null);
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 break-words text-sm font-medium">{a.titulo}</p>
          <Badge variant="outline" className={a.status === "aguardando" && a.desatualizado ? "border-warning/40 text-warning-text" : undefined}>
            {situacao(a)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Enviado por {a.enviadoPorNome} em {formatarData(a.enviadoEm)} · {a.itens.length} arquivo(s)
          {a.parcela ? ` · Parcela: ${a.parcela.rotulo}` : ""}
        </p>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Arquivos do pedido</summary>
        <ul className="mt-1 space-y-0.5">
          {a.itens.map((i) => (
            <li key={i.uploadId} className="break-all text-xs">
              {i.documentoTitulo} <span className="text-muted-foreground">· {i.disciplinaNome}{i.faseSigla ? ` · ${i.faseSigla}` : ""} · {i.revisaoRotulo}</span>
              {!i.nasEntregas && <span className="text-muted-foreground"> (fora das Entregas)</span>}
            </li>
          ))}
        </ul>
      </details>
      {ativa && <RespostaDaEquipe r={ativa} />}
      {anuladas.map((r) => (
        <RespostaDaEquipe key={r.id} r={r} />
      ))}
    </div>
  );
}

function RespostaDaEquipe({ r }: { r: RespostaDTO }) {
  const anulada = r.anulada !== null;
  const quem =
    r.origem === "portal"
      ? `${r.respondidoPorNome}, pelo portal, em ${formatarDataHora(r.respondidoEm)}`
      : `${r.respondidoPorNome}, por fora, em ${formatarData(r.respondidoEm)} — registrada por ${r.registradoPorNome ?? "—"}`;
  return (
    <div className="space-y-0.5 rounded-md bg-muted/50 px-3 py-2 text-sm">
      <p className={anulada ? "text-muted-foreground line-through" : "font-medium"}>
        {anulada && <span className="sr-only">(Resposta anulada) </span>}
        {ROTULO_RESPOSTA[r.resposta]} <span className="font-normal text-muted-foreground">— {quem}</span>
      </p>
      {r.texto && <p className={`whitespace-pre-wrap break-words ${anulada ? "text-muted-foreground line-through" : ""}`}>{r.texto}</p>}
      {r.comprovante && (
        <a
          href={hrefDoComprovante(r.comprovante.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Paperclip className="size-3.5" aria-hidden /> Comprovante: {r.comprovante.nome}
        </a>
      )}
      {r.anulada && (
        <p className="text-xs text-muted-foreground">
          Anulada por {r.anulada.por ?? "—"} em {formatarData(r.anulada.em)}: {r.anulada.motivo}
        </p>
      )}
    </div>
  );
}
