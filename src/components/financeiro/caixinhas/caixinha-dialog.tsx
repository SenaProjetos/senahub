"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { salvarCaixinha } from "@/modules/financeiro/caixinhas/actions";
import type { CaixinhaDto } from "@/modules/financeiro/caixinhas/queries";

const REGRAS = { meta_fixa: "Meta fixa", compromissos_ligados: "Compromissos ligados" } as const;

/**
 * Nova caixinha / editar. A necessidade é UMA de duas: um valor que a pessoa define (meta fixa) ou a
 * soma das contas a pagar ligadas a ela dentro do horizonte. Alocar dinheiro é outro gesto
 * ("Reservar valor"): criar a caixinha não separa nada do caixa.
 */
export function CaixinhaDialog({ aberto, caixinha, onFechar }: { aberto: boolean; caixinha: CaixinhaDto | null; onFechar: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [regra, setRegra] = useState<keyof typeof REGRAS>("compromissos_ligados");
  const [meta, setMeta] = useState<number | null>(null);
  const [horizonte, setHorizonte] = useState("30");
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setNome(caixinha?.nome ?? "");
    setDescricao(caixinha?.descricao ?? "");
    setRegra(caixinha?.regra ?? "compromissos_ligados");
    setMeta(caixinha?.meta != null ? caixinha.meta / 100 : null);
    setHorizonte(String(caixinha?.horizonteDias ?? 30));
  }, [aberto, caixinha]);

  function salvar() {
    iniciar(async () => {
      const r = await salvarCaixinha({
        id: caixinha?.id,
        nome,
        descricao,
        regra,
        meta: regra === "meta_fixa" ? meta : null,
        horizonteDias: Number(horizonte) || 30,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(caixinha ? "Caixinha atualizada." : "Caixinha criada. Use “Reservar valor” para separar dinheiro nela.");
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{caixinha ? "Editar caixinha" : "Nova caixinha"}</DialogTitle>
          <DialogDescription>Separação gerencial: nenhum dinheiro muda de banco.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cx-nome">Nome</Label>
              <Input id="cx-nome" value={nome} maxLength={80} placeholder="Ex.: Equipamentos, Seguro, Viagens" onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cx-desc">Descrição (opcional)</Label>
              <Input id="cx-desc" value={descricao} maxLength={300} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cx-regra">Necessidade</Label>
              <Select value={regra} onValueChange={(v) => v && setRegra(v as keyof typeof REGRAS)} items={REGRAS}>
                <SelectTrigger id="cx-regra" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compromissos_ligados">{REGRAS.compromissos_ligados}</SelectItem>
                  <SelectItem value="meta_fixa">{REGRAS.meta_fixa}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {regra === "meta_fixa"
                  ? "Um valor que você define. Sem meta, a caixinha só mostra o reservado."
                  : "A soma das contas a pagar ligadas a esta caixinha que vencem no horizonte."}
              </p>
            </div>
            {regra === "meta_fixa" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="cx-meta">Meta (opcional)</Label>
                <InputMoeda id="cx-meta" value={meta} onChange={setMeta} />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="cx-hor">Horizonte, em dias</Label>
                <Input id="cx-hor" type="number" min={7} max={180} value={horizonte} onChange={(e) => setHorizonte(e.target.value)} />
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={pendente || !nome.trim()} onClick={salvar}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
