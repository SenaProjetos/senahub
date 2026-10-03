"use client";

import { useEffect, useState, useTransition } from "react";
import { diaDeSaoPaulo } from "@/lib/data";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { brl } from "@/lib/utils";
import { carregarTransferencia, criarTransferencia, editarTransferencia } from "@/modules/financeiro/transferencias/actions";
import { motivoParaNaoCriar } from "@/modules/financeiro/transferencias/calculo";

type Conta = { id: string; nome: string };

const hojeIso = () => diaDeSaoPaulo();

/**
 * Transferir entre contas (M8): cria ou edita o PAR de lançamentos (despesa na origem + receita no destino).
 * Em edição, `transferenciaId` carrega o par; a escolha "já aconteceu" só existe ao criar (depois disso,
 * dar baixa e estornar são ações da transferência, no menu).
 */
export function TransferenciaDialog({
  aberto,
  transferenciaId,
  contas,
  contaInicial,
  onClose,
}: {
  aberto: boolean;
  /** Preenchido = edição. */
  transferenciaId: string | null;
  contas: Conta[];
  /** Conta que já vem como origem (a do extrato aberto). */
  contaInicial?: string | null;
  onClose: (salvou: boolean) => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [carregando, setCarregando] = useState(false);
  const [origemId, setOrigemId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeIso());
  const [descricao, setDescricao] = useState("");
  const [realizada, setRealizada] = useState(true);
  const [erroDeLeitura, setErroDeLeitura] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setErroDeLeitura(null);
    if (!transferenciaId) {
      setOrigemId(contaInicial ?? "");
      setDestinoId("");
      setValor(null);
      setData(hojeIso());
      setDescricao("");
      setRealizada(true);
      return;
    }
    let vivo = true;
    setCarregando(true);
    void carregarTransferencia({ transferenciaId }).then((r) => {
      if (!vivo) return;
      setCarregando(false);
      if (!r.ok || !r.data) return void setErroDeLeitura(r.ok ? "Esta transferência não existe mais ou perdeu uma das pernas." : r.error);
      setOrigemId(r.data.origemId ?? "");
      setDestinoId(r.data.destinoId ?? "");
      setValor(r.data.valor);
      setData(r.data.data);
      setDescricao(r.data.descricao);
      setRealizada(r.data.realizada);
    });
    return () => {
      vivo = false;
    };
  }, [aberto, transferenciaId, contaInicial]);

  const nome = (id: string) => contas.find((c) => c.id === id)?.nome ?? "—";
  const motivo = motivoParaNaoCriar({ origemId, destinoId, valorCentavos: Math.round((valor ?? 0) * 100) });
  const editando = transferenciaId !== null;

  function salvar() {
    if (motivo || valor == null) return;
    iniciar(async () => {
      const comum = { origemId, destinoId, valor, data, descricao, observacao: "" };
      const r = editando
        ? await editarTransferencia({ ...comum, transferenciaId: transferenciaId! })
        : await criarTransferencia({ ...comum, realizada });
      if (!r.ok) return void toast.error(r.error);
      toast.success(editando ? "Transferência atualizada." : realizada ? "Transferência registrada." : "Transferência agendada.");
      onClose(true);
    });
  }

  const itens = Object.fromEntries(contas.map((c) => [c.id, c.nome]));

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar transferência" : "Transferir entre contas"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {erroDeLeitura ? (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {erroDeLeitura}
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
                  <Label htmlFor="tr-origem">De (sai)</Label>
                  <Select value={origemId} onValueChange={(v) => v && setOrigemId(v)} items={itens} disabled={carregando}>
                    <SelectTrigger id="tr-origem" size="sm" className="w-full">
                      <SelectValue placeholder="Conta de origem" />
                    </SelectTrigger>
                    <SelectContent>
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
                  <Label htmlFor="tr-destino">Para (entra)</Label>
                  <Select value={destinoId} onValueChange={(v) => v && setDestinoId(v)} items={itens} disabled={carregando}>
                    <SelectTrigger id="tr-destino" size="sm" className="w-full">
                      <SelectValue placeholder="Conta de destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
                  <Label htmlFor="tr-valor">Valor</Label>
                  <InputMoeda id="tr-valor" value={valor} onChange={setValor} />
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
                  <Label htmlFor="tr-data">Data</Label>
                  <Input id="tr-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
                </div>
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
                <Label htmlFor="tr-desc">Descrição (opcional)</Label>
                <Input id="tr-desc" value={descricao} maxLength={120} placeholder="Ex.: Reforço de caixa" onChange={(e) => setDescricao(e.target.value)} />
              </div>
              {!editando && (
                <div className="flex items-center gap-2">
                  <Switch id="tr-real" checked={realizada} onCheckedChange={setRealizada} />
                  <Label htmlFor="tr-real">Já aconteceu</Label>
                  <span className="text-xs text-muted-foreground">{realizada ? "o saldo das contas muda hoje" : "fica agendada até a baixa"}</span>
                </div>
              )}
              {valor != null && valor > 0 && origemId && destinoId && !motivo && (
                <div className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]" aria-live="polite">
                  <b>O que acontece:</b> {realizada || editando ? "saem" : "vão sair"} {brl(valor)} de {nome(origemId)} e {realizada || editando ? "entram" : "vão entrar"} em {nome(destinoId)} em{" "}
                  {data.split("-").reverse().join("/")}. É um movimento entre contas próprias: <b>não entra na DRE nem no resultado</b>, só move o saldo das duas.
                </div>
              )}
              {motivo && (valor != null || destinoId) && (
                <p role="alert" className="text-[13px] font-medium text-destructive">
                  {motivo}
                </p>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button disabled={pendente || carregando || !!motivo || !!erroDeLeitura} onClick={salvar}>
            {editando ? "Salvar" : "Transferir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
