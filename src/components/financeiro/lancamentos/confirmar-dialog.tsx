"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { confirmarLancamento, adicionarAnexoLancamento } from "@/modules/financeiro/lancamentos/actions";
import type { LancamentoItem } from "@/modules/financeiro/lancamentos/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarMoeda } from "@/lib/moeda";
import { diaDeSaoPaulo } from "@/lib/data";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { planejarBaixa } from "@/modules/financeiro/lancamentos/baixa";
import { brl } from "@/lib/utils";

const NONE = "__none";

export function ConfirmarDialog({
  lancamento,
  onClose,
  contas,
  formas,
}: {
  lancamento: LancamentoItem | null;
  onClose: () => void;
  contas: { id: string; nome: string }[];
  formas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Dia de São Paulo: `toISOString()` é UTC e, depois das 21h, a data padrão da baixa virava amanhã.
  const hoje = diaDeSaoPaulo();
  const [contaId, setContaId] = useState(NONE);
  const [formaId, setFormaId] = useState(NONE);
  const [dataConf, setDataConf] = useState(hoje);
  const [valorEfetivo, setValorEfetivo] = useState<number | null>(null);
  // M7: acréscimos e abatimento da baixa, separados do valor do título.
  const [juros, setJuros] = useState<number | null>(null);
  const [multa, setMulta] = useState<number | null>(null);
  const [desconto, setDesconto] = useState<number | null>(null);
  const [comprovante, setComprovante] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ao abrir para um lançamento, pré-preenche o valor com o total (paga tudo por padrão).
  const lancKey = lancamento?.id ?? "";
  const [prevKey, setPrevKey] = useState(lancKey);
  if (prevKey !== lancKey) {
    setPrevKey(lancKey);
    setValorEfetivo(lancamento ? Number(lancamento.valor) : null);
    setContaId(NONE);
    setFormaId(NONE);
    setDataConf(hoje);
    setComprovante(null);
    setJuros(null);
    setMulta(null);
    setDesconto(null);
  }

  const total = lancamento ? Number(lancamento.valor) : 0;
  const cent = (v: number | null) => Math.round((v ?? 0) * 100);
  // O mesmo puro do servidor: o que sai da conta, o resto em aberto e cada acessório, antes de confirmar.
  const plano = lancamento
    ? planejarBaixa({ tipo: lancamento.tipo, valor: cent(total), principal: valorEfetivo == null ? null : cent(valorEfetivo), juros: cent(juros), multa: cent(multa), desconto: cent(desconto) })
    : null;
  const temConta = contaId !== NONE || !!lancamento?.contaId;
  const erro =
    plano && "erro" in plano
      ? plano.erro
      : (juros || multa || desconto) && !temConta
        ? "Juros, multa e desconto precisam da conta do pagamento: escolha a conta."
        : null;
  const restante = plano && !("erro" in plano) && plano.restante ? plano.restante / 100 : 0;
  const temAcessorio = !!(juros || multa || desconto);
  const verbo = lancamento?.tipo === "receita" ? "Entra na" : "Sai da";

  function confirmar() {
    if (!lancamento) return;
    const lancId = lancamento.id;
    start(async () => {
      // O comprovante vai ANTES da baixa: com "Exigir comprovante" ligado (M10), o servidor recusa a baixa
      // de um lançamento sem anexo. Se o envio falha, a baixa não é tentada.
      if (comprovante) {
        try {
          const fd = new FormData();
          fd.set("file", comprovante);
          const up = await fetch("/api/financeiro/lancamentos/anexo", { method: "POST", body: fd });
          const meta = await up.json();
          if (!up.ok) {
            toast.error(meta.error ?? "Comprovante não anexado.");
            return;
          }
          const a = await adicionarAnexoLancamento({ lancamentoId: lancId, meta });
          if (!a.ok) {
            toast.error(a.error);
            return;
          }
        } catch {
          toast.error("Falha ao anexar comprovante.");
          return;
        }
      }
      const r = await confirmarLancamento({
        id: lancId,
        contaId: contaId === NONE ? "" : contaId,
        formaId: formaId === NONE ? "" : formaId,
        dataConfirmacao: dataConf,
        principal: valorEfetivo != null && valorEfetivo < total ? valorEfetivo : undefined,
        juros: juros ?? undefined,
        multa: multa ?? undefined,
        desconto: desconto ?? undefined,
      });
      if (!r.ok) {
        toast.error(comprovante ? `${r.error} O comprovante ficou anexado.` : r.error);
        setComprovante(null);
        router.refresh();
        return;
      }
      if (r.data.restante != null) {
        toast.success(`Confirmado. Saldo de ${brl(r.data.restante)} ficou em aberto.`);
      } else {
        toast.success("Lançamento confirmado.");
      }
      setComprovante(null);
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={!!lancamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar lançamento</DialogTitle>
          <DialogDescription>
            {lancamento?.descricao} — entra no caixa e na DRE ao confirmar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta bancária</Label>
              <Select value={contaId} onValueChange={(v) => setContaId(v ?? NONE)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma</Label>
              <Select value={formaId} onValueChange={(v) => setFormaId(v ?? NONE)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {formas.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={dataConf} onChange={(e) => setDataConf(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor do título quitado</Label>
              <InputMoeda
                placeholder={lancamento ? formatarMoeda(total) : undefined}
                value={valorEfetivo}
                onChange={setValorEfetivo}
              />
            </div>
          </div>
          {restante > 0 && (
            <p className="text-xs text-warning">
              Pagamento parcial: {brl(restante)} ficará em aberto como uma nova {lancamento?.tipo === "receita" ? "conta a receber" : "conta a pagar"}.
            </p>
          )}
          <CollapsibleSection
            titulo="Juros, multa e desconto"
            resumo={temAcessorio && plano && !("erro" in plano) ? `${verbo.toLowerCase()} conta ${brl(plano.caixa / 100)}` : undefined}
          >
            <div className="grid gap-3 p-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
              <div className="space-y-1.5">
                <Label htmlFor="bx-juros">Juros</Label>
                <InputMoeda id="bx-juros" value={juros} onChange={setJuros} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bx-multa">Multa</Label>
                <InputMoeda id="bx-multa" value={multa} onChange={setMulta} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bx-desconto">Desconto</Label>
                <InputMoeda id="bx-desconto" value={desconto} onChange={setDesconto} />
              </div>
            </div>
            <p className="px-3 pb-3 text-xs text-muted-foreground">
              Cada um vira um lançamento próprio na DRE ({lancamento?.tipo === "receita" ? "juros recebidos são receita, desconto concedido é despesa" : "juros e multa são despesa financeira, desconto obtido é receita"}); o título fica com o valor dele. Desconto só quitando o título inteiro.
            </p>
          </CollapsibleSection>
          {temAcessorio && plano && !("erro" in plano) && (
            <p className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]" aria-live="polite">
              <b>{verbo} conta: {brl(plano.caixa / 100)}</b> — título {brl((total - restante))}
              {juros || multa ? ` + juros e multa ${brl((juros ?? 0) + (multa ?? 0))}` : ""}
              {desconto ? ` − desconto ${brl(desconto)}` : ""}.
            </p>
          )}
          {erro && (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {erro}
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Comprovante (opcional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-3.5" /> {comprovante ? comprovante.name : "Anexar comprovante"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !!erro}>
            {pending ? "Confirmando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
