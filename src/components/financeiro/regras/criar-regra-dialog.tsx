"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarRegraDeLancamento } from "@/modules/financeiro/regras/actions";
import { sugerirTermo } from "@/modules/financeiro/regras/motor";

export type LancamentoParaRegra = {
  id: string;
  descricao: string;
  categoria: string | null;
  temCentroOuProjeto: boolean;
};

/**
 * "Criar regra a partir deste lançamento" (mock "Regras"): sugere o texto que identifica o lançamento
 * (sem PAG/BOLETO/PIX nem números) e deixa escolher o que a regra vai preencher. A regra nova entra no
 * fim da lista e só vale daqui para frente.
 */
export function CriarRegraDialog({ lancamento, onClose }: { lancamento: LancamentoParaRegra | null; onClose: () => void }) {
  const [pendente, iniciar] = useTransition();
  const [termo, setTermo] = useState("");
  const [usarCategoria, setUsarCategoria] = useState(true);
  const [usarCentro, setUsarCentro] = useState(false);

  useEffect(() => {
    if (!lancamento) return;
    setTermo(sugerirTermo(lancamento.descricao));
    setUsarCategoria(!!lancamento.categoria);
    setUsarCentro(false);
  }, [lancamento]);

  function criar() {
    if (!lancamento) return;
    iniciar(async () => {
      const r = await criarRegraDeLancamento({ lancamentoId: lancamento.id, termo, usarCategoria, usarCentroEProjeto: usarCentro });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Regra criada. Ajuste a ordem em Mais → Regras de preenchimento.");
      onClose();
    });
  }

  const invalido = termo.trim().length < 2 || (!usarCategoria && !usarCentro);

  return (
    <Dialog open={lancamento !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar regra a partir deste lançamento</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <p className="text-[13px] text-muted-foreground">
            Lançamento: <b className="text-foreground">{lancamento?.descricao}</b>
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="rg-termo">Quando a descrição contiver</Label>
            <Input id="rg-termo" value={termo} maxLength={80} onChange={(e) => setTermo(e.target.value)} />
            <p className="text-xs text-muted-foreground">Sugerimos o trecho que se repete; tire números e palavras genéricas como PAG ou BOLETO.</p>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">Então preencher</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={usarCategoria} disabled={!lancamento?.categoria} onCheckedChange={(v) => setUsarCategoria(v === true)} />
              Categoria{lancamento?.categoria ? `: ${lancamento.categoria}` : " (este lançamento não tem)"}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={usarCentro} disabled={!lancamento?.temCentroOuProjeto} onCheckedChange={(v) => setUsarCentro(v === true)} />
              Centro de custo e projeto deste lançamento{lancamento?.temCentroOuProjeto ? "" : " (este lançamento não tem)"}
            </label>
          </fieldset>
          <p className="text-xs text-muted-foreground">A regra nova só vale daqui para frente: lançamentos antigos não mudam.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pendente || invalido} onClick={criar}>
            Criar regra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
