"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { InputPercentual } from "@/components/ui/input-percentual";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { criarVersaoEncargos } from "@/modules/rh/tabela-encargos/actions";
import type { ContratacaoComEncargos, ParametrosEncargos } from "@/modules/rh/rateio/custo-hora/parametros";

const PADRAO: Record<ContratacaoComEncargos, ParametrosEncargos> = {
  clt: { tipo: "clt", fgtsBp: 800, multaFgtsBp: 4000, inssEmpresaBp: 0, reservaDecimoTerceiro: true, reservaFerias: true, reservaAvisoPrevio: true, beneficios: [] },
  estagio: { tipo: "estagio", reservaRecesso: true, taxaAgenteCent: 0 },
  pro_labore: { tipo: "pro_labore", inssEmpresaBp: 0 },
};

/** Percentual (8 = 8%) e reais vêm dos campos como número; o banco guarda pontos-base e centavos. */
const paraBp = (v: number) => Math.round(v * 100);
const paraCent = (v: number) => Math.round(v * 100);

function proximoMes() {
  const d = new Date();
  const m = d.getMonth() + 2;
  return m > 12 ? `${d.getFullYear() + 1}-01` : `${d.getFullYear()}-${String(m).padStart(2, "0")}`;
}

type Beneficio = { nome: string; valor: number | null; suspenso: boolean };

export function NovaVersaoEncargosDialog({
  contratacao,
  base,
  onOpenChange,
}: {
  contratacao: ContratacaoComEncargos;
  /** Versão mais recente, para começar dela. */
  base: ParametrosEncargos | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState("");
  const p0 = base ?? PADRAO[contratacao];
  const [vigencia, setVigencia] = useState(proximoMes());
  const [observacao, setObservacao] = useState("");
  const [f, setF] = useState(() => ({
    fgts: (p0.tipo === "clt" ? p0.fgtsBp : 800) / 100 as number | null,
    multa: (p0.tipo === "clt" ? p0.multaFgtsBp : 4000) / 100 as number | null,
    inss: (p0.tipo === "clt" || p0.tipo === "pro_labore" ? p0.inssEmpresaBp : 0) / 100 as number | null,
    decimo: p0.tipo === "clt" ? p0.reservaDecimoTerceiro : true,
    ferias: p0.tipo === "clt" ? p0.reservaFerias : true,
    aviso: p0.tipo === "clt" ? p0.reservaAvisoPrevio : true,
    beneficios: (p0.tipo === "clt" ? p0.beneficios.map((b) => ({ nome: b.nome, valor: b.valorCent / 100, suspenso: b.suspensoNasFerias })) : []) as Beneficio[],
    recesso: p0.tipo === "estagio" ? p0.reservaRecesso : true,
    taxa: (p0.tipo === "estagio" ? p0.taxaAgenteCent : 0) / 100 as number | null,
  }));

  /** Lê o formulário; devolve a frase do primeiro campo vazio ou fora do limite. */
  function montar(): { parametros: ParametrosEncargos } | { erro: string } {
    const pct = (v: number | null, rotulo: string) =>
      v === null || v < 0 || v > 100 ? `${rotulo}: informe um percentual entre 0 e 100.` : null;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(vigencia)) return { erro: "Informe o mês em que a versão começa a valer." };
    if (contratacao === "clt") {
      const e = pct(f.fgts, "FGTS") ?? pct(f.multa, "Multa do FGTS") ?? pct(f.inss, "INSS da empresa");
      if (e) return { erro: e };
      for (const b of f.beneficios) {
        if (!b.nome.trim()) return { erro: "Dê um nome a cada benefício." };
        if (b.valor === null) return { erro: `${b.nome.trim()}: informe o valor.` };
      }
      return {
        parametros: {
          tipo: "clt", fgtsBp: paraBp(f.fgts!), multaFgtsBp: paraBp(f.multa!), inssEmpresaBp: paraBp(f.inss!),
          reservaDecimoTerceiro: f.decimo, reservaFerias: f.ferias, reservaAvisoPrevio: f.aviso,
          beneficios: f.beneficios.map((b) => ({ nome: b.nome.trim(), valorCent: paraCent(b.valor!), suspensoNasFerias: b.suspenso })),
        },
      };
    }
    if (contratacao === "estagio") {
      if (f.taxa === null) return { erro: "Taxa do agente: informe o valor (zero se não houver)." };
      return { parametros: { tipo: "estagio", reservaRecesso: f.recesso, taxaAgenteCent: paraCent(f.taxa) } };
    }
    const e = pct(f.inss, "INSS da empresa");
    if (e) return { erro: e };
    return { parametros: { tipo: "pro_labore", inssEmpresaBp: paraBp(f.inss!) } };
  }

  function salvar() {
    setErro("");
    const lido = montar();
    if ("erro" in lido) {
      setErro(lido.erro);
      return;
    }
    start(async () => {
      const r = await criarVersaoEncargos({ contratacao, vigencia, parametros: lido.parametros, observacao: observacao.trim() || undefined });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success("Versão criada.");
      onOpenChange(false);
      router.refresh();
    });
  }

  const check = (id: string, label: string, valor: boolean, set: (v: boolean) => void) => (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={valor} onCheckedChange={(v) => set(v === true)} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
  // Enquanto salva, nada fecha o diálogo (Esc, X ou Cancelar): o resultado ainda vai chegar.
  const fechar = (open: boolean) => {
    if (!open && pending) return;
    onOpenChange(open);
  };
  const mudarBeneficio = (i: number, parte: Partial<Beneficio>) =>
    setF({ ...f, beneficios: f.beneficios.map((x, j) => (j === i ? { ...x, ...parte } : x)) });

  return (
    <Dialog open onOpenChange={fechar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova versão da tabela</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="vigencia">Vale a partir de</Label>
            <Input id="vigencia" type="month" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
          </div>
          {contratacao === "clt" && (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="fgts">FGTS</Label>
                  <InputPercentual id="fgts" value={f.fgts} onChange={(v) => setF({ ...f, fgts: v })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="multa">Multa do FGTS</Label>
                  <InputPercentual id="multa" value={f.multa} onChange={(v) => setF({ ...f, multa: v })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inss">INSS da empresa</Label>
                  <InputPercentual id="inss" value={f.inss} onChange={(v) => setF({ ...f, inss: v })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">INSS da empresa fica 0 nos Anexos III e V do Simples: ele já vem no DAS.</p>
              {check("decimo", "Reserva de 13º", f.decimo, (v) => setF({ ...f, decimo: v }))}
              {check("ferias", "Reserva de férias + 1/3", f.ferias, (v) => setF({ ...f, ferias: v }))}
              {check("aviso", "Reserva de aviso prévio", f.aviso, (v) => setF({ ...f, aviso: v }))}
              <div className="space-y-2">
                <p className="text-sm font-medium">Benefícios por mês</p>
                {f.beneficios.map((b, i) => (
                  <div key={i} className="space-y-2 rounded-md border p-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                      <div className="space-y-1">
                        <Label htmlFor={`b-nome-${i}`}>Nome</Label>
                        <Input id={`b-nome-${i}`} maxLength={60} value={b.nome} onChange={(e) => mudarBeneficio(i, { nome: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`b-valor-${i}`}>Valor</Label>
                        <InputMoeda id={`b-valor-${i}`} value={b.valor} onChange={(v) => mudarBeneficio(i, { valor: v })} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {check(`b-susp-${i}`, "Não paga nas férias", b.suspenso, (v) => mudarBeneficio(i, { suspenso: v }))}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Remover benefício ${b.nome.trim() || i + 1}`}
                        onClick={() => setF({ ...f, beneficios: f.beneficios.filter((_, j) => j !== i) })}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => setF({ ...f, beneficios: [...f.beneficios, { nome: "", valor: null, suspenso: true }] })}>
                  Adicionar benefício
                </Button>
              </div>
            </>
          )}
          {contratacao === "estagio" && (
            <>
              {check("recesso", "Reserva de recesso (1/12 da bolsa)", f.recesso, (v) => setF({ ...f, recesso: v }))}
              <div className="space-y-1">
                <Label htmlFor="taxa">Taxa mensal do agente de integração</Label>
                <InputMoeda id="taxa" value={f.taxa} onChange={(v) => setF({ ...f, taxa: v })} />
              </div>
            </>
          )}
          {contratacao === "pro_labore" && (
            <div className="space-y-1">
              <Label htmlFor="inss-pl">INSS da empresa sobre o pró-labore</Label>
              <InputPercentual id="inss-pl" value={f.inss} onChange={(v) => setF({ ...f, inss: v })} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="obs">Observação</Label>
            <Input id="obs" maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: reajuste do vale-refeição" />
          </div>
        </DialogBody>
        <DialogFooter>
          {/* No rodapé fixo: no corpo, a frase ficava abaixo da dobra e o clique parecia não fazer nada. */}
          {erro && (
            <p role="alert" className="text-sm text-destructive sm:mr-auto sm:self-center">
              {erro}
            </p>
          )}
          <Button variant="outline" onClick={() => fechar(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            Criar versão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
