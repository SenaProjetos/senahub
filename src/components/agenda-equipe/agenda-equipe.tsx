"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus, MapPin } from "lucide-react";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotivoDialog } from "@/components/atas/motivo-dialog";
import { NovaAtaDialog } from "@/components/atas/nova-ata-dialog";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { cancelarReuniaoAgendada, removerNotaDoMarco } from "@/modules/portal/agenda/actions";
import {
  ACAO_CANCELAR_REUNIAO,
  ACAO_EDITAR_REUNIAO,
  ACAO_ESCREVER_NOTA,
  ACAO_IMPORTAR_ATA,
  ACAO_REMOVER_NOTA,
  itensDeMarcoAgenda,
  itensDeReuniaoAgendada,
} from "@/modules/portal/agenda/acoes";
import { rotuloDiferenca } from "@/modules/portal/agenda/marcos";
import type { AgendaParaEquipe, MarcoParaEquipe, ReuniaoParaEquipe } from "@/modules/portal/agenda/queries";
import { MOTIVO_CANCELAR_MAX, ROTULO_SITUACAO_REUNIAO } from "@/modules/portal/agenda/reunioes";
import { NotaDialog } from "./nota-dialog";
import { ReuniaoDialog } from "./reuniao-dialog";

const FALHA = "Não foi possível enviar. Verifique a conexão e tente de novo.";

const ROTULO_SITUACAO_MARCO = { no_prazo: "No prazo", alterada: "Previsão alterada", entregue: "Entregue", sem_combinado: "Sem combinado" } as const;
const CLASSE_SITUACAO_MARCO = {
  no_prazo: "border-success/40 text-success-text",
  alterada: "border-warning/40 text-warning-text",
  entregue: "border-success/40 text-success-text",
  sem_combinado: "text-muted-foreground",
} as const;

/**
 * Seção "Agenda" da aba Cliente do projeto (spec 2026-11-23-portal-agenda-contrato-design.md): as reuniões que a coordenação
 * agenda para o cliente e os marcos do contrato com a nota de motivo. A página só chega aqui para a audiência da conversa; o
 * serviço confere de novo. Menu da linha = mesmo array do `...` (ADR-0002); linha com uma ação só fica sem menu de contexto.
 */
export function AgendaEquipe({ projetoId, dados }: { projetoId: string; dados: AgendaParaEquipe }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [agendando, setAgendando] = useState(false);
  const [editando, setEditando] = useState<ReuniaoParaEquipe | null>(null);
  const [cancelando, setCancelando] = useState<ReuniaoParaEquipe | null>(null);
  const [importando, setImportando] = useState<ReuniaoParaEquipe | null>(null);
  const [nota, setNota] = useState<MarcoParaEquipe | null>(null);
  const [, start] = useTransition();

  function aoEscolherReuniao(r: ReuniaoParaEquipe, item: AcaoItemAcao) {
    if (item.id === ACAO_EDITAR_REUNIAO) return setEditando(r);
    if (item.id === ACAO_CANCELAR_REUNIAO) return setCancelando(r);
    if (item.id === ACAO_IMPORTAR_ATA) return setImportando(r);
  }

  async function aoEscolherMarco(m: MarcoParaEquipe, item: AcaoItemAcao) {
    if (item.id === ACAO_ESCREVER_NOTA) return setNota(m);
    if (item.id !== ACAO_REMOVER_NOTA) return;
    // Confirmar ANTES de abrir a transição (ADR-0002).
    if (item.confirmar && !(await confirmar({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: "destructive" }))) return;
    start(async () => {
      const r = await removerNotaDoMarco({ projetoId, marcoId: m.marcoId }).catch(() => null);
      if (!r) return void toast.error(FALHA);
      if (!r.ok) toast.error(r.error);
      else toast.success("Nota removida.");
      router.refresh();
    });
  }

  return (
    <Card id="agenda" className="scroll-mt-20">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden /> Agenda
        </CardTitle>
        <Button size="sm" onClick={() => setAgendando(true)}>
          <CalendarPlus className="size-4" aria-hidden /> Agendar reunião
        </Button>
      </CardHeader>
      <CardContent className="space-y-5 p-2 pt-0">
        <section className="space-y-2" aria-labelledby="agenda-reunioes">
          <h3 id="agenda-reunioes" className="px-2 text-sm font-semibold">
            Reuniões agendadas
          </h3>
          {dados.reunioes.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-muted-foreground">Nenhuma reunião agendada. O cliente vê aqui, no portal, as reuniões que você marcar.</p>
          ) : (
            <ul className="divide-y">
              {dados.reunioes.map((r) => {
                const itens = itensDeReuniaoAgendada(r);
                return (
                  <LinhaComMenu
                    key={r.id}
                    itens={itens.length > 1 ? itens : []}
                    onSelect={(item) => aoEscolherReuniao(r, item)}
                    render={<li className="flex flex-wrap items-start justify-between gap-2 px-2 py-3" />}
                  >
                    <div className="min-w-0 flex-1 space-y-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`min-w-0 break-words font-medium ${r.situacao === "cancelada" ? "line-through" : ""}`}>{r.titulo}</p>
                        <Badge variant="outline" className={r.situacao === "remarcada" ? "border-warning/40 text-warning-text" : ""}>
                          {ROTULO_SITUACAO_REUNIAO[r.situacao]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatarData(r.dia)} às {r.horaInicio}
                        {r.duracaoMinutos ? ` · ${r.duracaoMinutos} min` : ""}
                        {r.situacao === "remarcada" && r.diaAnterior && r.horaAnterior ? ` · era ${formatarData(r.diaAnterior).slice(0, 5)} às ${r.horaAnterior}` : ""}
                        {r.criadaPorNome ? ` · agendada por ${r.criadaPorNome}` : ""}
                      </p>
                      {r.local && (
                        <p className="flex min-w-0 items-start gap-1.5 break-words text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {r.local}
                        </p>
                      )}
                      {r.motivoCancelamento && <p className="break-words text-xs text-muted-foreground">Motivo: {r.motivoCancelamento}</p>}
                    </div>
                    <BotaoAcoes itens={itens} onSelect={(item) => aoEscolherReuniao(r, item)} rotulo={`Ações da reunião ${r.titulo}`} />
                  </LinhaComMenu>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-2" aria-labelledby="agenda-marcos">
          <h3 id="agenda-marcos" className="px-2 text-sm font-semibold">
            Marcos do contrato
          </h3>
          {dados.semMarcosPorque && (
            <p className="mx-2 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-text">
              O cliente ainda não vê os marcos de entrega. {dados.semMarcosPorque}
            </p>
          )}
          {dados.marcos.length === 0 ? (
            !dados.semMarcosPorque && <p className="px-2 pb-2 text-sm text-muted-foreground">Este projeto não tem contrato cobrado por entrega. O cliente vê só as datas do contrato e as reuniões.</p>
          ) : (
            <ul className="divide-y">
              {dados.marcos.map((m) => {
                const itens = itensDeMarcoAgenda(m);
                return (
                  <LinhaComMenu
                    key={m.parcelaId}
                    itens={itens}
                    onSelect={(item) => void aoEscolherMarco(m, item)}
                    render={<li className="flex flex-wrap items-start justify-between gap-2 px-2 py-3" />}
                  >
                    <div className="min-w-0 flex-1 space-y-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 break-words font-medium">{m.titulo}</p>
                        <Badge variant="outline" className={CLASSE_SITUACAO_MARCO[m.situacao]}>
                          {ROTULO_SITUACAO_MARCO[m.situacao]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {m.contratoTitulo}
                        {" · "}
                        {m.combinado ? `Combinado ${formatarData(m.combinado)} · ` : ""}
                        {m.situacao === "entregue" ? "Entregue" : "Previsão atual"} {formatarData(m.previsao)}
                        {m.diferencaDias != null ? ` (${rotuloDiferenca(m.diferencaDias)})` : ""}
                      </p>
                      {m.nota ? (
                        <p className="whitespace-pre-wrap break-words rounded-md bg-muted/50 px-3 py-2 text-xs">
                          <span className="font-medium">Nota para o cliente:</span> {m.nota}
                          <span className="block text-muted-foreground">
                            {m.notaPorNome ? `${m.notaPorNome}` : ""}
                            {m.notaEm ? `${m.notaPorNome ? ", " : ""}${formatarDataHora(m.notaEm)}` : ""}
                          </span>
                        </p>
                      ) : null}
                    </div>
                    <BotaoAcoes itens={itens} onSelect={(item) => void aoEscolherMarco(m, item)} rotulo={`Ações do marco ${m.titulo}`} />
                  </LinhaComMenu>
                );
              })}
            </ul>
          )}
        </section>
      </CardContent>

      <ReuniaoDialog projetoId={projetoId} aberto={agendando || editando !== null} edicao={editando} onFechar={() => (setAgendando(false), setEditando(null))} />
      <NotaDialog
        projetoId={projetoId}
        marco={nota ? { marcoId: nota.marcoId, titulo: nota.titulo, nota: nota.nota } : null}
        onFechar={() => setNota(null)}
      />
      <MotivoDialog
        aberto={cancelando !== null}
        titulo="Cancelar reunião"
        descricao={cancelando ? `${cancelando.titulo} — ${formatarData(cancelando.dia)} às ${cancelando.horaInicio}. O cliente vê a reunião como cancelada e é avisado. Não dá para desfazer; agende outra se precisar.` : ""}
        ajuda="Se preencher, o cliente lê o motivo."
        rotuloConfirmar="Cancelar reunião"
        max={MOTIVO_CANCELAR_MAX}
        obrigatorio={false}
        onFechar={() => setCancelando(null)}
        onConfirmar={async (motivo) => {
          if (!cancelando) return { ok: false, error: "Reunião não encontrada." };
          const r = await cancelarReuniaoAgendada({ reuniaoAgendadaId: cancelando.id, motivo });
          if (r.ok) {
            toast.success("Reunião cancelada.");
            router.refresh();
            return { ok: true };
          }
          router.refresh();
          return { ok: false, error: r.error };
        }}
      />
      <NovaAtaDialog projetoId={projetoId} agendadaId={importando?.id} aberta={importando !== null} aoFechar={() => setImportando(null)} />
    </Card>
  );
}
