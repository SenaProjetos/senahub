"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks, LogIn, LogOut } from "lucide-react";
import { abrirCiclo, cancelarCiclo } from "@/modules/rh/ciclo/actions";
import { MOTIVO_SAIDA_SEM_DESLIGAMENTO, PUBLICO_LABEL, TIPO_CICLO_LABEL, type TipoCiclo } from "@/modules/rh/ciclo/regras";
import type { CicloTela, EquipamentoDaPessoa, OpcoesCiclo } from "@/modules/rh/ciclo/queries";
import { CicloCartao, type QuemMarca } from "@/components/rh/ciclo-cartao";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { dataCurta } from "@/lib/dias-iso";

/**
 * Aba "Entrada e saída" da ficha (Gestão de Pessoas F4). O RH abre a lista sugerida pela
 * contratação (pode trocar) — nada abre sozinho. Depois do desligamento, a aba oferece a lista de
 * saída; se o desligamento for cancelado com a saída aberta, oferece cancelá-la.
 */
export function CiclosPessoa({
  userId,
  ciclos,
  opcoes,
  equipamentos,
  quem,
}: {
  userId: string;
  ciclos: CicloTela[];
  /** `null` = quem vê não gere (auto-serviço): só a lista e os próprios itens. */
  opcoes: OpcoesCiclo | null;
  equipamentos: EquipamentoDaPessoa[];
  quem: QuemMarca;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [abrindo, setAbrindo] = useState<{ tipo: TipoCiclo; templateId: string } | null>(null);
  const podeGerir = !!opcoes;
  const abertos = ciclos.filter((c) => c.status === "em_andamento");
  const historico = ciclos.filter((c) => c.status !== "em_andamento");
  const entradaAberta = abertos.some((c) => c.tipo === "entrada");
  const saidaAberta = abertos.find((c) => c.tipo === "saida");
  const desligamentoAgendado = !!opcoes?.ultimoDiaVinculo;

  function iniciar(tipo: TipoCiclo) {
    const sugerido = tipo === "entrada" ? opcoes?.sugeridoEntrada : opcoes?.sugeridoSaida;
    setAbrindo({ tipo, templateId: sugerido ?? "" });
  }

  function confirmarAbertura() {
    if (!abrindo) return;
    start(async () => {
      const r = await abrirCiclo({ userId, tipo: abrindo.tipo, templateId: abrindo.templateId });
      if (r.ok) {
        toast.success(`Lista de ${TIPO_CICLO_LABEL[abrindo.tipo].toLowerCase()} aberta.`);
        setAbrindo(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function cancelarSaidaOrfa() {
    if (!saidaAberta) return;
    const ok = await confirm({
      title: "Cancelar a lista de saída?",
      description: "O desligamento foi cancelado. Os itens ficam no histórico como estão.",
      confirmLabel: "Cancelar lista",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await cancelarCiclo({ id: saidaAberta.id });
      if (r.ok) {
        toast.success("Lista de saída cancelada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const modelosDoTipo = abrindo ? (opcoes?.modelos ?? []).filter((m) => m.tipo === abrindo.tipo) : [];

  return (
    <div className="space-y-4">
      {podeGerir && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={entradaAberta || pending} onClick={() => iniciar("entrada")}
            title={entradaAberta ? "Já há uma lista de entrada em andamento." : undefined}>
            <LogIn className="size-3.5" /> Abrir lista de entrada
          </Button>
          <Button size="sm" variant="outline" disabled={!!saidaAberta || !desligamentoAgendado || pending} onClick={() => iniciar("saida")}
            title={saidaAberta ? "Já há uma lista de saída em andamento." : !desligamentoAgendado ? MOTIVO_SAIDA_SEM_DESLIGAMENTO : undefined}>
            <LogOut className="size-3.5" /> Abrir lista de saída
          </Button>
        </div>
      )}

      {podeGerir && desligamentoAgendado && !saidaAberta && (
        <p className="rounded-sm border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
          Desligamento agendado: último dia {dataCurta(opcoes!.ultimoDiaVinculo)}. Abra a lista de saída para
          organizar transição de projetos, equipamentos e acessos.
        </p>
      )}
      {podeGerir && saidaAberta && !desligamentoAgendado && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
          <span className="flex-1">O desligamento foi cancelado, mas a lista de saída continua aberta.</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={cancelarSaidaOrfa}>
            Cancelar lista de saída
          </Button>
        </div>
      )}

      {abertos.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nenhuma lista em andamento"
          description={podeGerir ? "Abra a lista de entrada na admissão e a de saída depois de agendar o desligamento." : undefined}
        />
      ) : (
        abertos.map((c) => (
          <CicloCartao key={c.id} ciclo={c} quem={quem} podeGerir={podeGerir} equipamentos={equipamentos} />
        ))
      )}

      {historico.length > 0 && (
        <CollapsibleSection titulo={`Histórico (${historico.length})`} resumo={`${historico.length} lista(s) concluída(s) ou cancelada(s)`}>
          <div className="space-y-3">
            {historico.map((c) => (
              <CicloCartao key={c.id} ciclo={c} quem={quem} podeGerir={podeGerir} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      <Dialog open={!!abrindo} onOpenChange={(o) => !o && setAbrindo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir lista de {abrindo ? TIPO_CICLO_LABEL[abrindo.tipo].toLowerCase() : ""}</DialogTitle>
          </DialogHeader>
          {abrindo && (
            <div className="space-y-2">
              <Label htmlFor="modelo-ciclo">Lista-modelo</Label>
              {modelosDoTipo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma lista-modelo ativa deste tipo. Crie uma em RH → Administração.</p>
              ) : (
                <Select value={abrindo.templateId} onValueChange={(v) => setAbrindo({ ...abrindo, templateId: v ?? "" })}>
                  <SelectTrigger id="modelo-ciclo" className="w-full">
                    <SelectValue placeholder="Escolha a lista…" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelosDoTipo.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome} · {PUBLICO_LABEL[m.publico]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                Sugerida pela contratação. Os prazos contam a partir do {abrindo.tipo === "entrada" ? "início do vínculo" : "último dia do vínculo"}.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbrindo(null)}>
              Cancelar
            </Button>
            <Button disabled={pending || !abrindo?.templateId} onClick={confirmarAbertura}>
              Abrir lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
