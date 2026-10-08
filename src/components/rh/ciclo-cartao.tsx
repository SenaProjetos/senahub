"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Laptop } from "lucide-react";
import { cancelarCiclo, marcarItemCiclo } from "@/modules/rh/ciclo/actions";
import { itensDoCiclo, itensDoItemCiclo } from "@/modules/rh/ciclo/acoes";
import { progresso, RESPONSAVEL_LABEL, STATUS_CICLO_LABEL, TIPO_CICLO_LABEL } from "@/modules/rh/ciclo/regras";
import type { CicloTela, EquipamentoDaPessoa } from "@/modules/rh/ciclo/queries";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dataCurta } from "@/lib/dias-iso";
import { formatarData } from "@/lib/utils";

export type QuemMarca = { id: string; ehRh: boolean; ehTi: boolean };
type Item = CicloTela["itens"][number];

/**
 * Um ciclo de entrada ou saída: progresso, itens com dono e prazo, atrasos e o item de devolução
 * de equipamentos. Cada item tem menu de contexto e `...` (ADR-0002); a caixinha marca direto.
 */
export function CicloCartao({
  ciclo,
  quem,
  podeGerir,
  nome,
  hrefFicha = null,
  equipamentos = [],
}: {
  ciclo: CicloTela;
  quem: QuemMarca;
  podeGerir: boolean;
  /** Nome da pessoa — só na fila do RH (na ficha já se sabe de quem é). */
  nome?: string;
  hrefFicha?: string | null;
  equipamentos?: EquipamentoDaPessoa[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [evidencia, setEvidencia] = useState<{ item: Item; texto: string } | null>(null);
  const p = progresso(ciclo.itens);
  const atrasados = ciclo.itens.filter((i) => i.atrasado).length;
  const acoesCiclo = itensDoCiclo(ciclo, { podeGerir, hrefFicha });

  function marcar(item: Item, concluido: boolean, texto?: string | null) {
    start(async () => {
      const r = await marcarItemCiclo({ id: item.id, concluido, ...(texto !== undefined ? { evidencia: texto } : {}) });
      if (r.ok) {
        if (r.data.status === "concluido") toast.success("Lista concluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function aoSelecionarCiclo(acao: AcaoItemAcao) {
    if (acao.id !== "cancelar") return;
    if (acao.confirmar) {
      const ok = await confirm({
        title: acao.confirmar.titulo,
        description: acao.confirmar.descricao,
        confirmLabel: acao.confirmar.rotuloConfirmar,
        variant: "destructive",
      });
      if (!ok) return;
    }
    start(async () => {
      const r = await cancelarCiclo({ id: ciclo.id });
      if (r.ok) {
        toast.success("Lista cancelada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function aoSelecionarItem(item: Item, acao: AcaoItemAcao) {
    if (acao.id === "concluir") marcar(item, true);
    else if (acao.id === "reabrir") marcar(item, false);
    else if (acao.id === "evidencia") setEvidencia({ item, texto: item.evidencia ?? "" });
  }

  // Função de render, não componente aninhado: um componente definido aqui remontaria a cada
  // render e fecharia o menu aberto (ADR-0002).
  function linha(item: Item) {
    const acoes = itensDoItemCiclo(item, ciclo, quem);
    const podeMarcar = acoes.length > 0 && ciclo.status !== "cancelado";
    return (
      <LinhaComMenu
        key={item.id}
        itens={acoes}
        onSelect={(a) => aoSelecionarItem(item, a)}
        render={<li className="group flex items-start gap-2.5 rounded-sm px-2 py-1.5 hover:bg-muted/40 data-[popup-open]:bg-muted/30" />}
      >
        <Checkbox
          checked={item.concluido}
          disabled={!podeMarcar || pending}
          onCheckedChange={(v) => marcar(item, v === true)}
          aria-label={`${item.concluido ? "Reabrir" : "Marcar como feito"}: ${item.descricao}`}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${item.concluido ? "text-muted-foreground line-through" : ""}`}>{item.descricao}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>{RESPONSAVEL_LABEL[item.responsavel]}</span>
            {item.prazoEm && (
              <span className={item.atrasado ? "font-medium text-destructive" : ""}>
                {item.atrasado ? "atrasado · " : "até "}
                {dataCurta(item.prazoEm)}
              </span>
            )}
            {item.concluido && item.concluidoEm && <span>feito em {formatarData(item.concluidoEm)}</span>}
            {item.evidencia && <span className="italic">“{item.evidencia}”</span>}
          </p>
          {item.patrimonio && !item.concluido && (
            <div className="mt-1 rounded-sm border border-dashed px-2 py-1.5 text-xs">
              {equipamentos.length === 0 ? (
                <span className="text-muted-foreground">Nenhum ativo ou máquina registrado com esta pessoa no Patrimônio.</span>
              ) : (
                <ul className="space-y-0.5">
                  {equipamentos.map((e) => (
                    <li key={`${e.tipo}-${e.id}`} className="flex items-center gap-1.5">
                      <Laptop className="size-3 shrink-0 text-muted-foreground" />
                      <span>{e.nome}</span>
                      {e.detalhe && <span className="text-muted-foreground">· {e.detalhe}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <span className="mt-1 block text-muted-foreground">Só referência: transferir ou dar baixa é no Patrimônio.</span>
            </div>
          )}
        </div>
        <BotaoAcoes
          itens={acoes}
          onSelect={(a) => aoSelecionarItem(item, a)}
          rotulo={`Ações do item ${item.descricao}`}
          className="opacity-60 group-hover:opacity-100"
        />
      </LinhaComMenu>
    );
  }

  return (
    <LinhaComMenu
      itens={acoesCiclo}
      onSelect={aoSelecionarCiclo}
      render={<section className="space-y-3 rounded-sm border p-3 data-[popup-open]:bg-muted/20" />}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {nome ? `${nome} · ` : ""}
            {TIPO_CICLO_LABEL[ciclo.tipo]}
            {ciclo.modelo && <span className="font-normal text-muted-foreground"> · {ciclo.modelo}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {STATUS_CICLO_LABEL[ciclo.status]}
            {ciclo.ancora && ` · ${ciclo.tipo === "entrada" ? "início" : "último dia"} ${dataCurta(ciclo.ancora)}`}
            {` · ${p.feitos}/${p.total} ${p.total === 1 ? "item" : "itens"}`}
            {atrasados > 0 && ciclo.status === "em_andamento" && (
              <span className="ml-1 inline-flex items-center gap-1 font-medium text-destructive">
                <AlertTriangle className="size-3" /> {atrasados} atrasado{atrasados === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>
        <BotaoAcoes itens={acoesCiclo} onSelect={aoSelecionarCiclo} rotulo={`Ações da lista de ${TIPO_CICLO_LABEL[ciclo.tipo].toLowerCase()}`} />
      </header>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={p.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso da lista"
      >
        <div className={`h-full rounded-full ${ciclo.status === "concluido" ? "bg-success" : "bg-primary"}`} style={{ width: `${p.pct}%` }} />
      </div>
      <ul className="space-y-0.5">{ciclo.itens.map(linha)}</ul>

      <Dialog open={!!evidencia} onOpenChange={(o) => !o && setEvidencia(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Evidência do item</DialogTitle>
          </DialogHeader>
          {evidencia && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{evidencia.item.descricao}</p>
              <Label htmlFor="evidencia-ciclo">O que comprova (opcional)</Label>
              <textarea
                id="evidencia-ciclo"
                rows={3}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={evidencia.texto}
                maxLength={300}
                placeholder="Ex.: notebook patrimônio 0123 devolvido ao TI"
                onChange={(e) => setEvidencia({ ...evidencia, texto: e.target.value })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEvidencia(null)}>
              Cancelar
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                if (!evidencia) return;
                marcar(evidencia.item, evidencia.item.concluido, evidencia.texto);
                setEvidencia(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LinhaComMenu>
  );
}
