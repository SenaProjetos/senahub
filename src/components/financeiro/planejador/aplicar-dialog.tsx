"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { atualizarAntes, ehAjusteDeLancamento, type AjusteSimulado } from "@/modules/financeiro/liquidez/ajustes";
import type { LinhaRevisao } from "@/modules/financeiro/liquidez/aplicacao";
import type { Observado } from "@/modules/financeiro/liquidez/tipos";
import { aplicarCenario, previaAplicacao } from "@/modules/financeiro/planejador/cenarios/actions";
import { cn } from "@/lib/utils";

type Previa = { linhas: LinhaRevisao[]; aplicaveis: number; divergentes: string[]; atuais: Record<string, Observado | null> };

/**
 * "Aplicar N alterações ao financeiro?" (mock + spec §7). O servidor confere cada item de novo ao
 * abrir e ao aplicar; tudo ou nada. Quando algo mudou no real, "Atualizar ajustes" regrava a foto
 * (`antes`) com o estado de agora e tira os ajustes cujo lançamento foi pago, cancelado ou sumiu.
 */
export function AplicarDialog({
  aberto,
  onFechar,
  ajustes,
  cenarioId,
  onAtualizarAjustes,
  onAplicado,
}: {
  aberto: boolean;
  onFechar: () => void;
  ajustes: AjusteSimulado[];
  cenarioId: string | null;
  onAtualizarAjustes: (novos: AjusteSimulado[]) => void;
  onAplicado: (indices: number[]) => void;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciarCarga] = useTransition();
  const [aplicando, iniciarAplicacao] = useTransition();

  useEffect(() => {
    if (!aberto) {
      setPrevia(null);
      setErro(null);
      return;
    }
    iniciarCarga(async () => {
      const r = await previaAplicacao({ ajustes });
      if (r.ok) setPrevia(r.data);
      else setErro(r.error);
    });
  }, [aberto, ajustes]);

  function atualizar() {
    if (!previa) return;
    const novos: AjusteSimulado[] = [];
    for (const a of ajustes) {
      if (!ehAjusteDeLancamento(a)) {
        novos.push(a);
        continue;
      }
      const atual = previa.atuais[a.eventoId];
      // Pago, cancelado, excluído ou inexistente: não há mais o que planejar com ele.
      if (!atual || atual.excluido || atual.status === "confirmado" || atual.status === "cancelado") continue;
      novos.push(atualizarAntes(a, atual));
    }
    const removidos = ajustes.length - novos.length;
    onAtualizarAjustes(novos);
    toast.info(
      removidos > 0
        ? `Ajustes atualizados; ${removidos} ${removidos === 1 ? "saiu porque o lançamento" : "saíram porque os lançamentos"} já não está em aberto.`
        : "Ajustes atualizados com o financeiro de agora.",
    );
  }

  function aplicar() {
    iniciarAplicacao(async () => {
      const r = await aplicarCenario({ cenarioId, ajustes });
      if (!r.ok) {
        toast.error(r.error, { duration: 12000 });
        return;
      }
      toast.success(
        `${r.data.aplicadas} ${r.data.aplicadas === 1 ? "alteração aplicada" : "alterações aplicadas"} ao financeiro. O histórico de cada lançamento registra a mudança.`,
      );
      onAplicado(r.data.indices);
    });
  }

  const n = previa?.aplicaveis ?? 0;
  const rotuloN = `${n} ${n === 1 ? "alteração" : "alterações"}`;
  const bloqueado = !previa || previa.divergentes.length > 0 || n === 0;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !aplicando && onFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{previa ? `Aplicar ${rotuloN} ao financeiro?` : "Aplicar ao financeiro"}</DialogTitle>
          <DialogDescription>
            O sistema confere cada item de novo. Se o lançamento mudou desde a simulação, aquele item é recusado com o motivo — e nada é
            gravado até tudo conferir.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {carregando && !previa && <p className="text-sm text-muted-foreground">Conferindo com o financeiro…</p>}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {previa && (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13.5px]">
              {previa.linhas.map((l, i) => (
                <li
                  key={i}
                  className={cn(l.tipo === "informativo" && "text-muted-foreground", l.tipo === "divergente" && "font-medium text-destructive")}
                >
                  {l.texto}
                </li>
              ))}
            </ul>
          )}
          {previa && previa.divergentes.length > 0 && (
            <p className="mt-3 rounded-sm border border-warning/50 bg-warning/5 px-3 py-2 text-[13px]">
              Revise a simulação com o financeiro de agora: “Atualizar ajustes” aceita os valores atuais e tira o que já foi pago ou
              cancelado. Depois confira o impacto e aplique.
            </p>
          )}
          {previa && previa.divergentes.length === 0 && n === 0 && (
            <p className="mt-3 text-[13px] text-muted-foreground">Nada desta simulação vai para o financeiro: os ajustes só valem na simulação.</p>
          )}
        </DialogBody>
        <DialogFooter className="flex-wrap">
          <Button variant="outline" onClick={onFechar} disabled={aplicando}>
            Cancelar
          </Button>
          {previa && previa.divergentes.length > 0 && (
            <Button variant="outline" onClick={atualizar}>
              Atualizar ajustes
            </Button>
          )}
          <Button onClick={aplicar} disabled={bloqueado || aplicando}>
            {aplicando ? "Aplicando…" : previa ? `Aplicar ${rotuloN}` : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
