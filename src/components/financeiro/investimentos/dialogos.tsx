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
import {
  aportarInvestimento,
  criarInvestimento,
  editarInvestimento,
  registrarRendimento,
  resgatarInvestimento,
} from "@/modules/financeiro/investimentos/actions";
import { faixaDoIR, planejarResgate, ROTULO_LIQUIDEZ, sugerirRendimento, type LiquidezDoAtivo } from "@/modules/financeiro/investimentos/calculo";
import type { AtivoDto } from "@/modules/financeiro/investimentos/queries";

type Conta = { id: string; nome: string };
const NENHUMA = "__nenhuma";
const hoje = () => diaDeSaoPaulo();
const campo = "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5";
const duas = "grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]";

export const ROTULO_TIPO: Record<string, string> = {
  cdb: "CDB",
  lci: "LCI",
  lca: "LCA",
  tesouro: "Tesouro Direto",
  fundo: "Fundo",
  poupanca: "Poupança",
  debenture: "Debênture",
  outro: "Outro",
};
const ISENTOS = new Set(["lci", "lca", "poupanca"]);

function SeletorConta({ id, rotulo, contas, valor, onChange, vazio }: { id: string; rotulo: string; contas: Conta[]; valor: string; onChange: (v: string) => void; vazio?: string }) {
  const itens = { ...(vazio ? { [NENHUMA]: vazio } : {}), ...Object.fromEntries(contas.map((c) => [c.id, c.nome])) };
  return (
    <div className={campo}>
      <Label htmlFor={id}>{rotulo}</Label>
      <Select value={valor || (vazio ? NENHUMA : "")} onValueChange={(v) => onChange(!v || v === NENHUMA ? "" : v)} items={itens}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue placeholder="Escolha a conta" />
        </SelectTrigger>
        <SelectContent>
          {vazio && <SelectItem value={NENHUMA}>{vazio}</SelectItem>}
          {contas.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Cadastro do ativo. Novo pode já nascer com o aporte inicial (sai da conta escolhida). */
export function AtivoDialog({ aberto, ativo, contas, onClose }: { aberto: boolean; ativo: AtivoDto | null; contas: Conta[]; onClose: (salvou: boolean) => void }) {
  const [pendente, iniciar] = useTransition();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("cdb");
  const [instituicao, setInstituicao] = useState("");
  const [indexador, setIndexador] = useState("");
  const [liquidez, setLiquidez] = useState<LiquidezDoAtivo>("vencimento");
  const [vencimento, setVencimento] = useState("");
  const [isentoIR, setIsentoIR] = useState(false);
  const [contaOrigemId, setContaOrigemId] = useState("");
  const [aporte, setAporte] = useState<number | null>(null);
  const [dataAporte, setDataAporte] = useState(hoje());

  useEffect(() => {
    if (!aberto) return;
    setNome(ativo?.nome ?? "");
    setTipo(ativo?.tipo ?? "cdb");
    setInstituicao(ativo?.instituicao ?? "");
    setIndexador(ativo?.indexador ?? "");
    setLiquidez(ativo?.liquidez ?? "vencimento");
    setVencimento(ativo?.vencimento ?? "");
    setIsentoIR(ativo?.isentoIR ?? false);
    setContaOrigemId(ativo?.contaOrigemId ?? contas[0]?.id ?? "");
    setAporte(null);
    setDataAporte(hoje());
  }, [aberto, ativo, contas]);

  function trocarTipo(t: string) {
    setTipo(t);
    // Sugestão: LCI, LCA e poupança são isentas. A pessoa pode desmarcar.
    if (!ativo) setIsentoIR(ISENTOS.has(t));
    if (!ativo && (t === "fundo" || t === "poupanca")) setLiquidez("diaria");
  }

  function salvar() {
    iniciar(async () => {
      const dados = { nome, tipo: tipo as "cdb", instituicao, indexador, liquidez, vencimento: vencimento || null, isentoIR, contaOrigemId: contaOrigemId || null, observacao: "" };
      const r = ativo
        ? await editarInvestimento({ id: ativo.id, ...dados })
        : await criarInvestimento({ ...dados, aporte: aporte && aporte > 0 && contaOrigemId ? { valor: aporte, data: dataAporte, contaId: contaOrigemId } : null });
      if (!r.ok) return void toast.error(r.error);
      toast.success(ativo ? "Ativo atualizado." : "Ativo criado.");
      onClose(true);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ativo ? "Editar ativo" : "Novo investimento"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className={duas}>
            <div className={campo}>
              <Label htmlFor="iv-nome">Nome</Label>
              <Input id="iv-nome" value={nome} maxLength={80} placeholder="CDB 105% CDI" onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className={campo}>
              <Label htmlFor="iv-tipo">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => v && trocarTipo(v)} items={ROTULO_TIPO}>
                <SelectTrigger id="iv-tipo" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROTULO_TIPO).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className={duas}>
            <div className={campo}>
              <Label htmlFor="iv-inst">Instituição</Label>
              <Input id="iv-inst" value={instituicao} maxLength={80} placeholder="Itaú" onChange={(e) => setInstituicao(e.target.value)} />
            </div>
            <div className={campo}>
              <Label htmlFor="iv-idx">Rentabilidade</Label>
              <Input id="iv-idx" value={indexador} maxLength={80} placeholder="105% do CDI" onChange={(e) => setIndexador(e.target.value)} />
            </div>
          </div>
          <div className={duas}>
            <div className={campo}>
              <Label htmlFor="iv-liq">Liquidez</Label>
              <Select value={liquidez} onValueChange={(v) => v && setLiquidez(v as LiquidezDoAtivo)} items={ROTULO_LIQUIDEZ}>
                <SelectTrigger id="iv-liq" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROTULO_LIQUIDEZ).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={campo}>
              <Label htmlFor="iv-venc">Vencimento</Label>
              <Input id="iv-venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="iv-isento" checked={isentoIR} onCheckedChange={setIsentoIR} />
            <Label htmlFor="iv-isento">Isento de IR</Label>
            <span className="text-xs text-muted-foreground">LCI, LCA e poupança</span>
          </div>
          <SeletorConta id="iv-origem" rotulo="Conta de origem" contas={contas} valor={contaOrigemId} onChange={setContaOrigemId} vazio="Nenhuma" />
          {!ativo && (
            <div className={duas}>
              <div className={campo}>
                <Label htmlFor="iv-aporte">Aporte inicial (opcional)</Label>
                <InputMoeda id="iv-aporte" value={aporte} onChange={setAporte} />
              </div>
              <div className={campo}>
                <Label htmlFor="iv-data">Data do aporte</Label>
                <Input id="iv-data" type="date" value={dataAporte} onChange={(e) => setDataAporte(e.target.value)} />
              </div>
            </div>
          )}
          {!ativo && aporte != null && aporte > 0 && !contaOrigemId && (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              Escolha a conta de onde sai o aporte.
            </p>
          )}
          <p className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]">
            O ativo ganha uma conta própria, que <b>não entra no caixa</b>: o saldo dela é o valor atual. Aporte e resgate são transferências entre ela e a
            conta corrente; só o rendimento entra na DRE (e o IR, como despesa).
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button disabled={pendente || nome.trim().length < 2 || (!ativo && aporte != null && aporte > 0 && !contaOrigemId)} onClick={salvar}>
            {ativo ? "Salvar" : "Criar ativo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ModoDoMovimento = "aporte" | "resgate" | "rendimento";

/** Aporte, resgate e registrar rendimento, com o "o que acontece" calculado pelo mesmo puro do servidor. */
export function MovimentoDialog({ modo, ativo, contas, onClose }: { modo: ModoDoMovimento | null; ativo: AtivoDto | null; contas: Conta[]; onClose: (salvou: boolean) => void }) {
  const [pendente, iniciar] = useTransition();
  const [contaId, setContaId] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hoje());
  const [total, setTotal] = useState(false);
  const [ir, setIr] = useState<number | null>(null);
  const [irMexido, setIrMexido] = useState(false);

  useEffect(() => {
    if (!modo || !ativo) return;
    setContaId(ativo.contaOrigemId ?? contas[0]?.id ?? "");
    setValor(null);
    setData(hoje());
    setTotal(false);
    setIr(null);
    setIrMexido(false);
  }, [modo, ativo, contas]);

  const p = ativo?.posicao;
  const centavos = valor == null ? null : Math.round(valor * 100);
  const sugestao = modo === "rendimento" && p && centavos != null ? sugerirRendimento(p, { brutoInformado: centavos, data, isentoIR: ativo!.isentoIR }) : null;
  // Sem edição da pessoa, o IR mostrado é a sugestão do puro (derivado, sem efeito).
  const irSugerido = sugestao && !("erro" in sugestao) ? sugestao.ir / 100 : null;
  const irMostrado = irMexido ? ir : irSugerido;
  const plano = modo === "resgate" && p && centavos != null ? planejarResgate(p, { valorRecebido: centavos, total }) : null;

  const erro =
    sugestao && "erro" in sugestao ? sugestao.erro : plano && "erro" in plano ? plano.erro : modo !== "rendimento" && !contaId ? "Escolha a conta." : null;

  function salvar() {
    if (!ativo || !modo || valor == null || erro) return;
    iniciar(async () => {
      const r =
        modo === "aporte"
          ? await aportarInvestimento({ investimentoId: ativo.id, contaId, valor, data })
          : modo === "resgate"
            ? await resgatarInvestimento({ investimentoId: ativo.id, contaId, valorRecebido: valor, data, total })
            : await registrarRendimento({ investimentoId: ativo.id, brutoInformado: valor, data, ir: irMexido ? ir : null });
      if (!r.ok) return void toast.error(r.error);
      toast.success(modo === "aporte" ? "Aporte registrado." : modo === "resgate" ? (total ? "Resgate total: ativo arquivado." : "Resgate registrado.") : "Rendimento registrado.");
      onClose(true);
    });
  }

  const titulo = modo === "aporte" ? "Aportar" : modo === "resgate" ? "Resgatar" : "Registrar rendimento";

  return (
    <Dialog open={modo !== null} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {titulo} — {ativo?.nome}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {p && (
            <p className="text-[13px] text-muted-foreground">
              Valor atual: <b className="text-foreground">{brl(p.valorAtual / 100)}</b> · aplicado {brl(p.aplicado / 100)}
              {p.impostos > 0 ? ` · IR provisionado ${brl(p.impostos / 100)}` : ""}
            </p>
          )}
          <div className={duas}>
            <div className={campo}>
              <Label htmlFor="mv-valor">{modo === "rendimento" ? "Valor bruto que o banco mostra" : modo === "resgate" ? "Quanto caiu na conta" : "Valor"}</Label>
              <InputMoeda id="mv-valor" value={valor} onChange={setValor} />
            </div>
            <div className={campo}>
              <Label htmlFor="mv-data">Data</Label>
              <Input id="mv-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          {modo !== "rendimento" && (
            <SeletorConta id="mv-conta" rotulo={modo === "aporte" ? "Sai da conta" : "Entra na conta"} contas={contas} valor={contaId} onChange={setContaId} />
          )}
          {modo === "resgate" && (
            <div className="flex items-center gap-2">
              <Switch id="mv-total" checked={total} onCheckedChange={setTotal} />
              <Label htmlFor="mv-total">Resgate total</Label>
              <span className="text-xs text-muted-foreground">zera e arquiva o ativo</span>
            </div>
          )}
          {modo === "rendimento" && sugestao && !("erro" in sugestao) && (
            <div className={campo}>
              <Label htmlFor="mv-ir">IR a provisionar</Label>
              <InputMoeda
                id="mv-ir"
                value={irMostrado}
                onChange={(v) => {
                  setIr(v);
                  setIrMexido(true);
                }}
              />
              <span className="text-xs text-muted-foreground">
                {ativo?.isentoIR ? "Ativo isento: IR zero." : `Sugestão pela tabela regressiva: ${faixaDoIR(sugestao.dias)}, sobre todo o rendimento, menos o já provisionado.`}
              </span>
            </div>
          )}
          {!erro && valor != null && valor > 0 && (
            <div className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]" aria-live="polite">
              <b>O que acontece: </b>
              {modo === "aporte" && <>saem {brl(valor)} da conta e entram no ativo. É uma transferência: não entra na DRE.</>}
              {modo === "rendimento" && sugestao && !("erro" in sugestao) && (
                <>
                  rendimento de <b>{brl(sugestao.rendimento / 100)}</b> entra na DRE como receita
                  {irMostrado ? (
                    <>
                      {" "}
                      e o IR de <b>{brl(irMostrado)}</b> como despesa
                    </>
                  ) : null}
                  . O caixa não muda: o dinheiro continua aplicado.
                </>
              )}
              {modo === "resgate" && plano && !("erro" in plano) && (
                <>
                  entram {brl(plano.transferencia / 100)} na conta (transferência, fora da DRE).
                  {plano.ajuste && (
                    <>
                      {" "}
                      A diferença para o valor atual, {brl(plano.ajuste.valor / 100)}, entra como {plano.ajuste.tipo === "rendimento" ? "rendimento" : "IR/IOF"}.
                    </>
                  )}
                  {plano.total && " O ativo zera e sai da carteira."}
                </>
              )}
            </div>
          )}
          {erro && valor != null && (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {erro}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button disabled={pendente || valor == null || valor <= 0 || !!erro} onClick={salvar}>
            {titulo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
