"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, TriangleAlert } from "lucide-react";
import { lancarFeriasColaborador } from "@/modules/rh/actions";
import type { ColaboradorComDireitoFerias } from "@/modules/rh/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Lançamento de férias pelo RH, sem solicitação do colaborador. O registro nasce aprovado —
 * a validação de perfil do alvo e a regra CLT de início são refeitas no servidor
 * (`lancarFeriasColaborador`); aqui só evitamos o round-trip óbvio.
 */
export function LancarFeriasDialog({
  colaboradores,
  ultimoMesFechado,
}: {
  colaboradores: ColaboradorComDireitoFerias[];
  /** Último mês com banco de horas fechado — dispara o aviso de lançamento retroativo. */
  ultimoMesFechado: { ano: number; mes: number } | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [obs, setObs] = useState("");

  // `inicio` é "YYYY-MM-DD"; comparar como string ordena igual à data.
  const mesFechado =
    !!ultimoMesFechado &&
    inicio.length >= 7 &&
    inicio.slice(0, 7) <= `${ultimoMesFechado.ano}-${String(ultimoMesFechado.mes).padStart(2, "0")}`;

  function fechar(o: boolean) {
    setAberto(o);
    if (!o) {
      setUserId("");
      setInicio("");
      setFim("");
      setObs("");
    }
  }

  function lancar() {
    if (!userId) {
      toast.error("Selecione o colaborador.");
      return;
    }
    if (!inicio || !fim) {
      toast.error("Informe as datas.");
      return;
    }
    if (fim < inicio) {
      toast.error("A data de fim não pode ser anterior ao início.");
      return;
    }
    start(async () => {
      const r = await lancarFeriasColaborador({ userId, inicio, fim, observacao: obs || undefined });
      if (r.ok) {
        toast.success("Férias lançadas. O colaborador foi notificado.");
        fechar(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        <CalendarPlus className="size-3.5" /> Lançar férias
      </Button>
      {aberto && (
        <Dialog open onOpenChange={fechar}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Lançar férias</DialogTitle>
              <DialogDescription>
                Registra o período já aprovado, sem depender de solicitação do colaborador. Ele será
                notificado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Colaborador</Label>
                <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {colaboradores.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {colaboradores.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum colaborador CLT ou estagiário ativo — férias são instituto celetista.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Início</Label>
                  <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fim</Label>
                  <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
                </div>
              </div>
              <Input
                placeholder="Observação (opcional)"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
              {mesFechado && (
                <p className="flex items-start gap-2 rounded-sm border border-dashed p-2 text-xs text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    O banco de horas desse mês já foi fechado. Depois de lançar, use{" "}
                    <strong>Recalcular histórico</strong> em Banco de horas para o saldo refletir as
                    férias.
                  </span>
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => fechar(false)}>
                Cancelar
              </Button>
              <Button onClick={lancar} disabled={pending} loading={pending}>
                Lançar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
