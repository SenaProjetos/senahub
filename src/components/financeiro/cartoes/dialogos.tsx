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
  editarCompraDoCartao,
  lancarCompraNoCartao,
  pagarCompraDoCartao,
  pagarFatura,
  salvarCartao,
} from "@/modules/financeiro/cartoes/actions";
import { cicloDaCompra, DIA_MAX, DIA_MIN, rotuloDaCompetencia } from "@/modules/financeiro/cartoes/ciclo";
import type { CartaoDto, CompraDto } from "@/modules/financeiro/cartoes/queries";

export type OpcoesCartoes = {
  categorias: { id: string; codigo: string; nome: string; tipo: string }[];
  centros: { id: string; nome: string }[];
  projetos: { id: string; codigo: string; nome: string }[];
  fornecedores: { id: string; nome: string }[];
  contas: { id: string; nome: string }[];
  socios: { id: string; nome: string }[];
};

const NENHUM = "__nenhum";
const hojeIso = () => diaDeSaoPaulo();

function Campo({ id, rotulo, valor, onChange, itens, placeholder = "Não preencher" }: { id: string; rotulo: string; valor: string; onChange: (v: string) => void; itens: { id: string; nome: string }[]; placeholder?: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select value={valor || NENHUM} onValueChange={(v) => onChange(!v || v === NENHUM ? "" : v)} items={Object.fromEntries([[NENHUM, placeholder], ...itens.map((i) => [i.id, i.nome])])}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NENHUM}>{placeholder}</SelectItem>
          {itens.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Cadastro do cartão: da empresa (com limite) ou pessoal de um sócio. */
export function CartaoDialog({ cartao, aberto, onClose, opcoes }: { cartao: CartaoDto | null; aberto: boolean; onClose: (salvou: boolean) => void; opcoes: OpcoesCartoes }) {
  const [pendente, iniciar] = useTransition();
  const [nome, setNome] = useState("");
  const [digitos, setDigitos] = useState("");
  const [tipo, setTipo] = useState<"empresa" | "pessoal">("empresa");
  const [socioId, setSocioId] = useState("");
  const [limite, setLimite] = useState<number | null>(null);
  const [fechamento, setFechamento] = useState("25");
  const [vencimento, setVencimento] = useState("5");
  const [contaId, setContaId] = useState("");
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!aberto) return;
    setNome(cartao?.nome ?? "");
    setDigitos(cartao?.ultimosDigitos ?? "");
    setTipo(cartao?.tipo ?? "empresa");
    setSocioId("");
    setLimite(cartao?.limiteCentavos != null ? cartao.limiteCentavos / 100 : null);
    setFechamento(String(cartao?.diaFechamento ?? 25));
    setVencimento(String(cartao?.diaVencimento ?? 5));
    setContaId(cartao?.contaPadraoId ?? "");
    setAtivo(cartao?.ativo ?? true);
  }, [aberto, cartao]);

  function salvar() {
    iniciar(async () => {
      const r = await salvarCartao({
        id: cartao?.id,
        nome,
        ultimosDigitos: digitos,
        tipo,
        socioId: tipo === "pessoal" ? socioId : null,
        limite: tipo === "empresa" ? limite : null,
        diaFechamento: Number(fechamento),
        diaVencimento: Number(vencimento),
        contaPadraoId: contaId,
        ativo,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(cartao ? "Cartão atualizado." : "Cartão criado.");
      onClose(true);
    });
  }

  const dias = Array.from({ length: DIA_MAX - DIA_MIN + 1 }, (_, i) => String(i + DIA_MIN));

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cartao ? "Editar cartão" : "Novo cartão"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor="c-nome">Nome</Label>
              <Input id="c-nome" value={nome} maxLength={60} placeholder="Ex.: Visa Empresarial" onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor="c-dig">Últimos 4 dígitos</Label>
              <Input id="c-dig" value={digitos} inputMode="numeric" maxLength={4} placeholder="4821" onChange={(e) => setDigitos(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor="c-tipo">De quem é</Label>
              <Select value={tipo} onValueChange={(v) => v && setTipo(v as "empresa" | "pessoal")} items={{ empresa: "Da empresa", pessoal: "Pessoal (de um sócio)" }}>
                <SelectTrigger id="c-tipo" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa">Da empresa</SelectItem>
                  <SelectItem value="pessoal">Pessoal (de um sócio)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tipo === "pessoal" ? (
              <Campo id="c-socio" rotulo="Sócio" valor={socioId} onChange={setSocioId} itens={opcoes.socios} placeholder="Escolha o sócio" />
            ) : (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
                <Label htmlFor="c-lim">Limite (opcional)</Label>
                <InputMoeda id="c-lim" value={limite} onChange={setLimite} />
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor="c-fech">Fecha no dia</Label>
              <Select value={fechamento} onValueChange={(v) => v && setFechamento(v)} items={Object.fromEntries(dias.map((d) => [d, d]))}>
                <SelectTrigger id="c-fech" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dias.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor="c-venc">Vence no dia (mês seguinte)</Label>
              <Select value={vencimento} onValueChange={(v) => v && setVencimento(v)} items={Object.fromEntries(dias.map((d) => [d, d]))}>
                <SelectTrigger id="c-venc" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dias.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Só os dias 1 a 28, para existirem em todo mês — inclusive fevereiro.</p>
          <Campo id="c-conta" rotulo="Conta que costuma pagar" valor={contaId} onChange={setContaId} itens={opcoes.contas} />
          <div className="flex items-center gap-2">
            <Switch id="c-ativo" checked={ativo} onCheckedChange={setAtivo} />
            <Label htmlFor="c-ativo">Cartão ativo</Label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button disabled={pendente || nome.trim().length < 2 || (tipo === "pessoal" && !socioId)} onClick={salvar}>
            Salvar cartão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lançar ou editar uma compra. A despesa é do dia da compra; a fatura vem do ciclo do cartão. */
export function CompraDialog({
  cartao,
  compra,
  aberto,
  onClose,
  opcoes,
}: {
  cartao: CartaoDto | null;
  /** Preenchida = edição. */
  compra: CompraDto | null;
  aberto: boolean;
  onClose: (salvou: boolean) => void;
  opcoes: OpcoesCartoes;
}) {
  const [pendente, iniciar] = useTransition();
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeIso());
  const [categoriaId, setCategoriaId] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [centroId, setCentroId] = useState("");
  const [projetoId, setProjetoId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");

  useEffect(() => {
    if (!aberto) return;
    setDescricao(compra ? compra.descricao.replace(/\s*\(\d+\/\d+\)\s*$/, "") : "");
    setValor(compra ? compra.valorCentavos / 100 : null);
    setData(compra?.data ?? hojeIso());
    setCategoriaId("");
    setParcelas("1");
    setCentroId("");
    setProjetoId("");
    setFornecedorId("");
  }, [aberto, compra]);

  const despesas = opcoes.categorias.filter((c) => c.tipo === "despesa");
  const ciclo = cartao ? cicloDaCompra(cartao, data) : null;
  const n = Number(parcelas) || 1;

  function salvar() {
    if (!cartao || valor == null || !categoriaId) return;
    iniciar(async () => {
      const comum = {
        descricao,
        valor,
        dataCompra: data,
        categoriaId,
        centroId,
        projetoId,
        fornecedorId,
      };
      const r = compra
        ? await editarCompraDoCartao({ lancamentoId: compra.id, ...comum })
        : await lancarCompraNoCartao({ cartaoId: cartao.id, parcelas: n, ...comum });
      if (!r.ok) return void toast.error(r.error);
      toast.success(compra ? "Compra atualizada." : n > 1 ? `Compra lançada em ${n} parcelas.` : "Compra lançada.");
      onClose(true);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{compra ? "Editar compra" : `Lançar compra — ${cartao?.nome ?? ""}`}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
            <Label htmlFor="co-desc">Descrição</Label>
            <Input id="co-desc" value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor="co-valor">Valor total</Label>
              <InputMoeda id="co-valor" value={valor} onChange={setValor} />
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor="co-data">Data da compra</Label>
              <Input id="co-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            {!compra && (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
                <Label htmlFor="co-parc">Parcelas</Label>
                <Input id="co-parc" inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, "").slice(0, 2))} />
              </div>
            )}
          </div>
          <Campo id="co-cat" rotulo="Categoria" valor={categoriaId} onChange={setCategoriaId} itens={despesas.map((c) => ({ id: c.id, nome: `${c.codigo} ${c.nome}` }))} placeholder="Escolha a categoria" />
          <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
            <Campo id="co-centro" rotulo="Centro de custo" valor={centroId} onChange={setCentroId} itens={opcoes.centros} />
            <Campo id="co-proj" rotulo="Projeto" valor={projetoId} onChange={setProjetoId} itens={opcoes.projetos.map((p) => ({ id: p.id, nome: `${p.codigo} · ${p.nome}` }))} />
            <Campo id="co-forn" rotulo="Fornecedor" valor={fornecedorId} onChange={setFornecedorId} itens={opcoes.fornecedores} />
          </div>
          {ciclo && valor != null && (
            <div className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]" aria-live="polite">
              <b>O que acontece:</b> {n > 1 ? `${n} despesas de ${brl(Math.round((valor / n) * 100) / 100)}` : `uma despesa de ${brl(valor)}`} a partir de{" "}
              {data.split("-").reverse().join("/")}, na DRE do mês de cada parcela, <b>sem sair do caixa</b>. A{" "}
              {n > 1 ? "primeira entra" : "despesa entra"} na fatura de {rotuloDaCompetencia(ciclo.competencia)}, que vence em{" "}
              {ciclo.vencimento.split("-").reverse().join("/")}.
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button disabled={pendente || !cartao || valor == null || valor <= 0 || !categoriaId || descricao.trim().length < 2} onClick={salvar}>
            {compra ? "Salvar" : "Lançar compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type AlvoDePagamento =
  | { tipo: "fatura"; faturaId: string; rotulo: string; totalCentavos: number; vencimento: string; pessoal: boolean }
  | { tipo: "compra"; lancamentoId: string; rotulo: string; totalCentavos: number; restanteCentavos: number };

/** Pagar a fatura inteira ou uma compra só. Nos dois casos nenhuma despesa nova é criada. */
export function PagamentoDialog({ alvo, onClose, opcoes, contaPadraoId }: { alvo: AlvoDePagamento | null; onClose: (pagou: boolean) => void; opcoes: OpcoesCartoes; contaPadraoId?: string | null }) {
  const [pendente, iniciar] = useTransition();
  const [contaId, setContaId] = useState("");
  const [data, setData] = useState(hojeIso());

  useEffect(() => {
    if (!alvo) return;
    setContaId(contaPadraoId ?? opcoes.contas[0]?.id ?? "");
    setData(alvo.tipo === "fatura" ? alvo.vencimento : hojeIso());
  }, [alvo, contaPadraoId, opcoes.contas]);

  function pagar() {
    if (!alvo || !contaId) return;
    iniciar(async () => {
      const r = alvo.tipo === "fatura" ? await pagarFatura({ faturaId: alvo.faturaId, contaId, data }) : await pagarCompraDoCartao({ lancamentoId: alvo.lancamentoId, contaId, data });
      if (!r.ok) return void toast.error(r.error);
      toast.success(alvo.tipo === "fatura" ? "Fatura paga." : "Reembolso pago.");
      onClose(true);
    });
  }

  const pessoal = alvo?.tipo === "fatura" ? alvo.pessoal : true;

  return (
    <Dialog open={alvo !== null} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{alvo?.tipo === "compra" ? "Reembolsar só esta" : pessoal ? "Reembolsar" : "Pagar fatura"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
            <Label>{alvo?.tipo === "compra" ? "Despesa" : "Fatura"}</Label>
            <div className="rounded-md border px-3 py-2 text-sm">{alvo?.rotulo}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Campo id="pg-conta" rotulo="Pagar com a conta" valor={contaId} onChange={setContaId} itens={opcoes.contas} placeholder="Escolha a conta" />
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor="pg-data">Data do pagamento</Label>
              <Input id="pg-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          {alvo && (
            <div className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]">
              <b>O que acontece:</b> saem {brl(alvo.totalCentavos / 100)} da conta escolhida em {data.split("-").reverse().join("/")}.{" "}
              <b>Nenhuma despesa nova é criada</b> — cada compra já é despesa desde o dia dela.
              {alvo.tipo === "compra" && alvo.restanteCentavos > 0 && (
                <>
                  {" "}
                  A fatura continua com {brl(alvo.restanteCentavos / 100)}.
                </>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button disabled={pendente || !contaId} onClick={pagar}>
            {alvo ? `${pessoal ? "Reembolsar" : "Pagar"} ${brl(alvo.totalCentavos / 100)}` : "Pagar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
