"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { registrarProposta } from "@/modules/custos/cotacoes/actions";

type ItemRfq = { id: string; descricao: string; unidade: string; quantidade: number };
type FornecedorOpcao = { id: string; nome: string };

export function RegistrarPropostaDialog({ rfqId, itens, fornecedores }: { rfqId: string; itens: ItemRfq[]; fornecedores: FornecedorOpcao[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fornecedorId, setFornecedorId] = useState("");
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const [frete, setFrete] = useState("0");
  const [impostosInclusos, setImpostosInclusos] = useState(true);
  const [impostosValor, setImpostosValor] = useState("");
  const [prazoEntregaDias, setPrazoEntregaDias] = useState("");
  const [validadeAte, setValidadeAte] = useState("");
  const [condicoesPagamento, setCondicoesPagamento] = useState("");
  const [observacoes, setObservacoes] = useState("");

  function fechar() {
    setOpen(false);
    setFornecedorId("");
    setPrecos({});
    setFrete("0");
    setImpostosInclusos(true);
    setImpostosValor("");
    setPrazoEntregaDias("");
    setValidadeAte("");
    setCondicoesPagamento("");
    setObservacoes("");
  }

  function salvar() {
    if (!fornecedorId) {
      toast.error("Escolha o fornecedor.");
      return;
    }
    const itensPreenchidos = itens
      .filter((i) => precos[i.id] && Number(precos[i.id]) >= 0)
      .map((i) => ({ rfqItemId: i.id, precoUnitario: Number(precos[i.id]) }));
    if (itensPreenchidos.length === 0) {
      toast.error("Informe o preço de ao menos um item.");
      return;
    }
    startTransition(async () => {
      const r = await registrarProposta({
        rfqId,
        fornecedorId,
        itens: itensPreenchidos,
        frete: frete ? Number(frete) : 0,
        impostosInclusos,
        impostosValor: !impostosInclusos && impostosValor ? Number(impostosValor) : undefined,
        prazoEntregaDias: prazoEntregaDias ? Number(prazoEntregaDias) : undefined,
        validadeAte: validadeAte || undefined,
        condicoesPagamento: condicoesPagamento.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
      });
      if (r.ok) {
        toast.success("Proposta registrada.");
        fechar();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : fechar())}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FileInput className="size-4" /> Registrar proposta
      </Button>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar proposta recebida</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Fornecedor</Label>
            <Select value={fornecedorId} onValueChange={(v) => v && setFornecedorId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o fornecedor" />
              </SelectTrigger>
              <SelectContent>
                {fornecedores.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Preço unitário por item (deixe em branco se o fornecedor não cotou)</Label>
            <div className="space-y-1.5 rounded-sm border p-2">
              {itens.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {item.descricao} <span className="text-muted-foreground">({item.quantidade} {item.unidade})</span>
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="R$/un"
                    value={precos[item.id] ?? ""}
                    onChange={(e) => setPrecos((p) => ({ ...p, [item.id]: e.target.value }))}
                    className="w-28"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prop-frete">Frete (R$)</Label>
              <Input id="prop-frete" type="number" step="0.01" min={0} value={frete} onChange={(e) => setFrete(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prop-prazo">Prazo de entrega (dias)</Label>
              <Input id="prop-prazo" type="number" min={0} value={prazoEntregaDias} onChange={(e) => setPrazoEntregaDias(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={impostosInclusos} onCheckedChange={() => setImpostosInclusos((v) => !v)} />
              Preço já inclui impostos
            </label>
            {!impostosInclusos && (
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="Valor do imposto destacado (R$)"
                value={impostosValor}
                onChange={(e) => setImpostosValor(e.target.value)}
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              Se o fornecedor cotou o preço SEM imposto, marque desmarcado e informe o valor — o comparador soma isso ao total. Se já
              vem embutido no preço, deixe marcado (não soma de novo).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prop-validade">Validade da proposta</Label>
              <Input id="prop-validade" type="date" value={validadeAte} onChange={(e) => setValidadeAte(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prop-condicoes">Condições de pagamento</Label>
              <Input id="prop-condicoes" value={condicoesPagamento} onChange={(e) => setCondicoesPagamento(e.target.value)} placeholder="30/60/90 dias…" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prop-obs">Observações</Label>
            <Input id="prop-obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Registrando…" : "Registrar proposta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
