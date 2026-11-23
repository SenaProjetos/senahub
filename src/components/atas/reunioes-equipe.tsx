"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { conferirPendenciaCliente, corrigirAta, reabrirPendenciaCliente, retirarAta } from "@/modules/portal/atas/actions";
import {
  ACAO_ABRIR_RASCUNHO,
  ACAO_CONFERIR,
  ACAO_CORRIGIR,
  ACAO_REABRIR,
  ACAO_RETIRAR,
  hrefDoEditor,
  itensDaPendencia,
  itensDaReuniao,
} from "@/modules/portal/atas/acoes";
import type { PendenciaDTO, ReuniaoDTO, VersaoDTO } from "@/modules/portal/atas/queries";
import { MOTIVO_REABRIR_MAX, MOTIVO_RETIRAR_MAX, ROTULO_RESPOSTA_ATA, ROTULO_SITUACAO_PENDENCIA, ROTULO_TIPO_ITEM } from "@/modules/portal/atas/regras";
import { MotivoDialog } from "./motivo-dialog";
import { NovaAtaDialog } from "./nova-ata-dialog";
import { TextoAta } from "./texto-ata";

const FALHA = "Não foi possível enviar. Verifique a conexão e tente de novo.";

function situacao(r: ReuniaoDTO): string {
  if (r.retirada) return "Retirada";
  if (!r.vigente) return "Rascunho";
  if (r.vigente.resposta === "concorda") return "Confirmada";
  if (r.vigente.resposta === "observacoes") return "Com observações";
  return "Aguardando o cliente";
}

/**
 * Seção "Reuniões e atas" da aba Cliente (spec 2026-11-22-portal-atas-reuniao-design.md): as reuniões do projeto com a
 * ata, a resposta do cliente e as pendências dele. A página só chega aqui para a audiência da conversa; o serviço confere
 * de novo. Menu da linha = mesmo array do `...` (ADR-0002); linha com uma ação só fica sem menu de contexto.
 */
export function ReunioesEquipe({
  projetoId,
  reunioes,
  pendencias,
  contasAtivas,
}: {
  projetoId: string;
  reunioes: ReuniaoDTO[];
  pendencias: PendenciaDTO[];
  contasAtivas: number;
}) {
  const router = useRouter();
  const [retirando, setRetirando] = useState<ReuniaoDTO | null>(null);
  const [reabrindo, setReabrindo] = useState<PendenciaDTO | null>(null);
  const [ocupado, start] = useTransition();

  function aoEscolherReuniao(r: ReuniaoDTO, item: AcaoItemAcao) {
    if (item.id === ACAO_ABRIR_RASCUNHO) return router.push(hrefDoEditor(projetoId, r.id));
    if (item.id === ACAO_RETIRAR) return setRetirando(r);
    if (item.id !== ACAO_CORRIGIR || ocupado) return;
    start(async () => {
      const res = await corrigirAta({ reuniaoId: r.id }).catch(() => null);
      if (!res) return void toast.error(FALHA);
      if (!res.ok) {
        toast.error(res.error);
        return router.refresh();
      }
      router.push(hrefDoEditor(projetoId, r.id));
    });
  }

  function aoEscolherPendencia(p: PendenciaDTO, item: AcaoItemAcao) {
    if (item.id === ACAO_REABRIR) return setReabrindo(p);
    if (item.id !== ACAO_CONFERIR || ocupado) return;
    start(async () => {
      const res = await conferirPendenciaCliente({ pendenciaId: p.id }).catch(() => null);
      if (!res) return void toast.error(FALHA);
      if (!res.ok) toast.error(res.error);
      else toast.success("Pendência conferida.");
      router.refresh();
    });
  }

  const pendenciasDe = (reuniaoId: string) => pendencias.filter((p) => p.reuniaoId === reuniaoId);

  return (
    <Card id="atas" className="scroll-mt-20">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> Reuniões e atas
        </CardTitle>
        <NovaAtaDialog projetoId={projetoId} />
      </CardHeader>
      <CardContent className="space-y-4 p-2 pt-0">
        {contasAtivas === 0 && (
          <p className="mx-2 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-text">
            Este cliente não tem conta ativa no portal: as atas ficam registradas, sem confirmação.
          </p>
        )}
        {reunioes.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Nenhuma ata ainda. Traga as anotações do Gemini de uma reunião com o cliente para registrar decisões e tarefas.
          </p>
        ) : (
          <ul className="divide-y">
            {reunioes.map((r) => {
              const itens = itensDaReuniao(r);
              const minhas = pendenciasDe(r.id);
              const abertas = minhas.filter((p) => p.situacao === "aberta" || p.situacao === "reaberta").length;
              const atrasadas = minhas.filter((p) => p.atrasada).length;
              return (
                <LinhaComMenu
                  key={r.id}
                  itens={itens.length > 1 ? itens : []}
                  onSelect={(item) => aoEscolherReuniao(r, item)}
                  render={<li className="flex flex-wrap items-start justify-between gap-2 px-2 py-3" />}
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 break-words text-sm font-medium">{r.titulo}</p>
                        <Badge variant="outline">{situacao(r)}</Badge>
                        {r.rascunho && r.vigente && <Badge variant="outline">Correção em rascunho</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatarData(r.data)}
                        {r.vigente ? ` · versão ${r.vigente.numero}` : ""}
                        {r.vigente?.publicadaPorNome ? ` · publicada por ${r.vigente.publicadaPorNome}` : ""}
                        {abertas > 0 ? ` · ${abertas} pendência(s) do cliente aberta(s)` : ""}
                        {atrasadas > 0 ? ` · ${atrasadas} atrasada(s)` : ""}
                      </p>
                    </div>
                    {r.retirada && (
                      <p className="text-xs text-muted-foreground">
                        Retirada por {r.retirada.por} em {formatarData(r.retirada.em)}: {r.retirada.motivo}
                      </p>
                    )}
                    {!r.vigente && r.rascunho && (
                      <a href={hrefDoEditor(projetoId, r.id)} className="text-sm font-medium underline underline-offset-2">
                        Continuar o rascunho
                      </a>
                    )}
                    {r.vigente && <RespostaDaVersao v={r.vigente} />}
                    {r.vigente && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-xs text-muted-foreground">Ver a ata publicada</summary>
                        <VersaoNaEquipe v={r.vigente} />
                      </details>
                    )}
                    {r.anteriores.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-xs text-muted-foreground">Versões anteriores ({r.anteriores.length})</summary>
                        <ul className="mt-2 space-y-2">
                          {r.anteriores.map((v) => (
                            <li key={v.id} className="rounded-md bg-muted/50 px-3 py-2">
                              <p className="text-xs font-medium">Versão {v.numero}</p>
                              <RespostaDaVersao v={v} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  <BotaoAcoes itens={itens} onSelect={(item) => aoEscolherReuniao(r, item)} rotulo={`Ações da ata ${r.titulo}`} />
                </LinhaComMenu>
              );
            })}
          </ul>
        )}

        {pendencias.length > 0 && (
          <div className="space-y-2 px-2">
            <h3 className="text-sm font-semibold">Pendências do cliente</h3>
            <ul className="divide-y rounded-md border">
              {pendencias.map((p) => {
                const itens = itensDaPendencia(p);
                return (
                  <LinhaComMenu
                    key={p.id}
                    itens={itens}
                    onSelect={(item) => aoEscolherPendencia(p, item)}
                    render={<li className="flex flex-wrap items-start justify-between gap-2 px-3 py-2" />}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 break-words font-medium">{p.titulo}</p>
                        <Badge variant="outline">{ROTULO_SITUACAO_PENDENCIA[p.situacao]}</Badge>
                        {p.atrasada && (
                          <Badge variant="outline" className="border-destructive/40 text-destructive">
                            Atrasada
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.prazo ? `Prazo ${formatarData(p.prazo)} · ` : ""}Ata de {formatarData(p.reuniaoData)} — {p.reuniaoTitulo}
                      </p>
                      {p.feitaPorNome && p.feitaEm && (
                        <p className="text-xs text-muted-foreground">
                          Marcada como feita por {p.feitaPorNome} em {formatarDataHora(p.feitaEm)}
                          {p.comentarioFeito ? `: ${p.comentarioFeito}` : ""}
                        </p>
                      )}
                      {p.motivoReabertura && <p className="text-xs text-muted-foreground">Reaberta: {p.motivoReabertura}</p>}
                    </div>
                    <BotaoAcoes itens={itens} onSelect={(item) => aoEscolherPendencia(p, item)} rotulo={`Ações da pendência ${p.titulo}`} />
                  </LinhaComMenu>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>

      {retirando && (
        <MotivoDialog
          key={retirando.id}
          aberto
          titulo="Retirar a ata?"
          descricao={`${retirando.titulo} — some do portal do cliente e da lista de Decisões; as tarefas abertas são arquivadas e as pendências não conferidas, canceladas.`}
          ajuda="Fica registrado só para a equipe. Não dá para desfazer."
          rotuloConfirmar="Retirar ata"
          max={MOTIVO_RETIRAR_MAX}
          onFechar={() => setRetirando(null)}
          onConfirmar={async (motivo) => {
            const res = await retirarAta({ reuniaoId: retirando.id, motivo });
            if (res.ok) {
              toast.success("Ata retirada.");
              router.refresh();
            }
            return res.ok ? { ok: true } : { ok: false, error: res.error };
          }}
        />
      )}
      {reabrindo && (
        <MotivoDialog
          key={reabrindo.id}
          aberto
          titulo="Reabrir a pendência?"
          descricao={reabrindo.titulo}
          ajuda="O cliente vê este motivo no portal."
          rotuloConfirmar="Reabrir"
          max={MOTIVO_REABRIR_MAX}
          onFechar={() => setReabrindo(null)}
          onConfirmar={async (motivo) => {
            const res = await reabrirPendenciaCliente({ pendenciaId: reabrindo.id, motivo });
            if (res.ok) {
              toast.success("Pendência reaberta.");
              router.refresh();
            }
            return res.ok ? { ok: true } : { ok: false, error: res.error };
          }}
        />
      )}
    </Card>
  );
}

function RespostaDaVersao({ v }: { v: VersaoDTO }) {
  if (!v.resposta) return <p className="text-xs text-muted-foreground">Sem resposta do cliente.</p>;
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
      <p className="font-medium">
        {ROTULO_RESPOSTA_ATA[v.resposta]}{" "}
        <span className="font-normal text-muted-foreground">
          — {v.respondidaPorNome}
          {v.respondidaEm ? `, ${formatarDataHora(v.respondidaEm)}` : ""}
        </span>
      </p>
      {v.observacao && <p className="whitespace-pre-wrap break-words">{v.observacao}</p>}
    </div>
  );
}

function VersaoNaEquipe({ v }: { v: VersaoDTO }) {
  return (
    <div className="mt-2 space-y-3">
      <TextoAta texto={v.texto} />
      {v.itens.length > 0 && (
        <ul className="space-y-1">
          {v.itens.map((i) => (
            <li key={i.chave} className="text-sm">
              <span className="text-xs text-muted-foreground">{ROTULO_TIPO_ITEM[i.tipo]}: </span>
              <span className="font-medium">{i.titulo}</span>
              {i.responsavelNome ? <span className="text-xs text-muted-foreground"> · {i.responsavelNome}</span> : null}
              {i.prazo ? <span className="text-xs text-muted-foreground"> · até {formatarData(i.prazo)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
