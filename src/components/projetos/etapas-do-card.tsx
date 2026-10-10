"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Send, Undo2 } from "lucide-react";
import { desfazerEnvioEtapaAnalise, enviarEtapaAnalise } from "@/modules/projetos/envio-etapa-actions";
import { etapaAtrasada, etapaAtualDoCard, type EtapaDoCard } from "@/modules/projetos/etapas-card";
import { motivoParaDesfazerEnvio, motivoParaEnviar } from "@/modules/projetos/envio-etapa";
import { STATUS_CHIP, STATUS_LABEL } from "@/modules/projetos/status";
import { diaDeSaoPaulo } from "@/lib/data";
import { formatarData, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * Etapas da disciplina no card (áudio do dono, 2026-10-10): TODAS, com início e fim, para o
 * projetista saber o prazo de cada uma — a coordenação preenche à mão, olhando a EAP. O
 * responsável da disciplina ainda tem o botão "Enviei os documentos desta etapa" (e o de
 * desfazer, até a coordenação aprovar). Sem etapa cadastrada, não ocupa lugar.
 */
export function EtapasDoCard({
  disciplina,
  etapas,
  ehResponsavel,
}: {
  disciplina: string;
  etapas: EtapaDoCard[];
  ehResponsavel: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  if (etapas.length === 0) return null;

  const hoje = diaDeSaoPaulo();
  const atual = etapaAtualDoCard(etapas);

  // O confirm vem ANTES do start: dentro da transition o setState do diálogo suspende e trava a tela.
  async function enviar(e: EtapaDoCard) {
    const ok = await confirm({
      title: `Enviar a etapa ${e.nome} para análise?`,
      description: `Você está dizendo que enviou todos os documentos de ${e.nome} (${disciplina}). A coordenação do projeto é avisada. Dá para desfazer até ela aprovar.`,
      confirmLabel: "Enviei os documentos",
    });
    if (!ok) return;
    start(async () => {
      const r = await enviarEtapaAnalise({ etapaId: e.id });
      if (r.ok) {
        toast.success("Envio registrado. A coordenação foi avisada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function desfazer(e: EtapaDoCard) {
    const ok = await confirm({
      title: `Desfazer o envio de ${e.nome}?`,
      description: "A etapa volta para Em andamento e a coordenação é avisada.",
      confirmLabel: "Desfazer envio",
    });
    if (!ok) return;
    start(async () => {
      const r = await desfazerEnvioEtapaAnalise({ etapaId: e.id });
      if (r.ok) {
        toast.success("Envio desfeito.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <ul className="space-y-1.5 px-4 pt-3" aria-label={`Etapas de ${disciplina}`}>
      {etapas.map((e) => {
        const motivoEnviar = motivoParaEnviar(e.status);
        const motivoDesfazer = motivoParaDesfazerEnvio(e.status);
        const atrasada = etapaAtrasada(e, hoje);
        const ehAtual = atual?.id === e.id;
        return (
          <li
            key={e.id}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-sm border px-2.5 py-1.5 text-xs",
              ehAtual ? "border-primary/40 bg-primary/5" : "border-transparent bg-muted/30",
            )}
            aria-current={ehAtual ? "step" : undefined}
          >
            <span className="min-w-0 flex-1 max-sm:basis-full">
              <span className="font-mono font-bold">{e.sigla}</span> <span className="text-muted-foreground">{e.nome}</span>
            </span>
            <span className={cn("flex items-center gap-1 whitespace-nowrap", atrasada ? "font-medium text-destructive" : "text-muted-foreground")}>
              <CalendarDays className="size-3" aria-hidden />
              {e.inicio ? formatarData(e.inicio) : "—"} → {e.prazo ? formatarData(e.prazo) : "—"}
              {atrasada && " · atrasada"}
            </span>
            <Badge variant="outline" className={cn("text-[11px]", STATUS_CHIP[e.status])}>
              {STATUS_LABEL[e.status]}
            </Badge>
            {ehResponsavel && (
              <>
                {motivoEnviar == null && (
                  <Button size="xs" variant="outline" disabled={pending} onClick={() => void enviar(e)}>
                    <Send className="size-3" aria-hidden /> Enviei os documentos
                  </Button>
                )}
                {motivoDesfazer == null && (
                  <Button size="xs" variant="ghost" disabled={pending} onClick={() => void desfazer(e)}>
                    <Undo2 className="size-3" aria-hidden /> Desfazer envio
                  </Button>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
