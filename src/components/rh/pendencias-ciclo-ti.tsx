"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { marcarItemCiclo } from "@/modules/rh/ciclo/actions";
import { itensDoItemCiclo } from "@/modules/rh/ciclo/acoes";
import { TIPO_CICLO_LABEL } from "@/modules/rh/ciclo/regras";
import type { PendenciasCiclo } from "@/modules/rh/ciclo/queries";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dataCurta } from "@/lib/dias-iso";

type Linha = PendenciasCiclo["ti"][number];

/**
 * Itens de entrada e saída que são da TI (criar acesso, entregar e recolher máquina, encerrar
 * acessos). A TI não abre a ficha da pessoa nem a fila do RH; marca aqui, na tela dela.
 */
export function PendenciasCicloTi({ itens, quemId }: { itens: Linha[]; quemId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [evidencia, setEvidencia] = useState<{ item: Linha; texto: string } | null>(null);
  if (itens.length === 0) return null;
  const quem = { id: quemId, ehRh: false, ehTi: true };

  function concluir(item: Linha, texto?: string) {
    start(async () => {
      const r = await marcarItemCiclo({ id: item.id, concluido: true, ...(texto !== undefined ? { evidencia: texto } : {}) });
      if (r.ok) {
        toast.success("Item marcado como feito.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function aoSelecionar(item: Linha, acao: AcaoItemAcao) {
    if (acao.id === "concluir") concluir(item);
    else if (acao.id === "evidencia") setEvidencia({ item, texto: "" });
  }

  function linha(l: Linha) {
    const acoes = itensDoItemCiclo({ concluido: false, responsavel: l.responsavel }, { status: "em_andamento", userId: l.userId }, quem);
    return (
      <LinhaComMenu
        key={l.id}
        itens={acoes}
        onSelect={(a) => aoSelecionar(l, a)}
        render={<li className="group flex items-start gap-2.5 px-3 py-2 hover:bg-muted/40 data-[popup-open]:bg-muted/30" />}
      >
        <Checkbox
          checked={false}
          disabled={pending}
          onCheckedChange={(v) => v === true && concluir(l)}
          aria-label={`Marcar como feito: ${l.descricao} (${l.nome})`}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm">{l.descricao}</p>
          <p className="text-xs text-muted-foreground">
            {l.nome} · {TIPO_CICLO_LABEL[l.tipo]}
            {l.prazoEm && (
              <span className={l.atrasado ? " font-medium text-destructive" : ""}>
                {" "}
                · {l.atrasado ? "atrasado" : "até"} {dataCurta(l.prazoEm)}
              </span>
            )}
          </p>
        </div>
        <BotaoAcoes itens={acoes} onSelect={(a) => aoSelecionar(l, a)} rotulo={`Ações do item ${l.descricao}`} className="opacity-60 group-hover:opacity-100" />
      </LinhaComMenu>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Entrada e saída de pessoas</CardTitle>
        <CardDescription>Itens da TI nas listas de admissão e desligamento.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">{itens.map(linha)}</ul>
      </CardContent>

      <Dialog open={!!evidencia} onOpenChange={(o) => !o && setEvidencia(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como feito, com evidência</DialogTitle>
          </DialogHeader>
          {evidencia && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {evidencia.item.descricao} · {evidencia.item.nome}
              </p>
              <Label htmlFor="evidencia-ti">O que comprova (opcional)</Label>
              <textarea
                id="evidencia-ti"
                rows={3}
                maxLength={300}
                value={evidencia.texto}
                placeholder="Ex.: notebook patrimônio 0123 recolhido"
                onChange={(e) => setEvidencia({ ...evidencia, texto: e.target.value })}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
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
                concluir(evidencia.item, evidencia.texto);
                setEvidencia(null);
              }}
            >
              Marcar como feito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
