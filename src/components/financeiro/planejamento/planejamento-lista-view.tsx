"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { criarPlano, excluirPlano } from "@/modules/financeiro/planejamento/actions";
import type { PlanoResumo, OpcoesPlanejamento } from "@/modules/financeiro/planejamento/queries";
import { STATUS_META, type StatusPlano } from "./status";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const NONE = "__none";
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PlanejamentoListaView({ planos, opcoes }: { planos: PlanoResumo[]; opcoes: OpcoesPlanejamento }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Planejamento de pagamentos</h2>
          <p className="text-sm text-muted-foreground">Simule o uso do caixa disponível antes de pagar.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Novo cenário</Button>
      </div>

      {planos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum cenário ainda. Crie um para começar a planejar.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {planos.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/financeiro/planejamento/${p.id}`} className="flex flex-1 items-center gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.qtdLinhas} conta(s) · {p.responsavel} · {new Date(p.criadoEm).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="font-mono text-sm">{brl(p.totalPlanejado)}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">de {brl(p.saldoDisponivel)}</p>
                    </div>
                    <Badge variant="outline" className={STATUS_META[p.status as StatusPlano].classe}>
                      {STATUS_META[p.status as StatusPlano].label}
                    </Badge>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </Link>
                  <ExcluirBtn id={p.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <NovoCenarioDialog open={open} onClose={() => setOpen(false)} opcoes={opcoes} />
    </div>
  );
}

function ExcluirBtn({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function excluir() {
    if (!confirm("Excluir este cenário? As linhas do plano serão removidas (os lançamentos não são afetados).")) return;
    start(async () => {
      const r = await excluirPlano({ id });
      if (r.ok) {
        toast.success("Cenário excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  return (
    <Button variant="ghost" size="icon" aria-label="Excluir" onClick={excluir} disabled={pending}>
      <Trash2 className="size-4" />
    </Button>
  );
}

function NovoCenarioDialog({ open, onClose, opcoes }: { open: boolean; onClose: () => void; opcoes: OpcoesPlanejamento }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [saldo, setSaldo] = useState("");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [contaId, setContaId] = useState(NONE);
  const [centroId, setCentroId] = useState(NONE);
  const [projetoId, setProjetoId] = useState(NONE);
  const [obs, setObs] = useState("");

  function salvar() {
    if (!nome || !saldo) {
      toast.error("Informe nome e saldo disponível.");
      return;
    }
    start(async () => {
      const r = await criarPlano({
        nome,
        saldoDisponivel: Number(saldo),
        periodoIni: ini || "",
        periodoFim: fim || "",
        contaId: contaId === NONE ? "" : contaId,
        centroId: centroId === NONE ? "" : centroId,
        projetoId: projetoId === NONE ? "" : projetoId,
        observacoes: obs,
      });
      if (r.ok) {
        toast.success(`Cenário criado com ${r.data.linhas} conta(s).`);
        onClose();
        router.push(`/financeiro/planejamento/${r.data.id}`);
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo cenário de planejamento</DialogTitle>
          <DialogDescription>O sistema carrega as contas a pagar em aberto do período e filtros.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Nome do cenário</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Operacional junho" />
            </div>
            <div className="space-y-1.5">
              <Label>Saldo disponível (R$)</Label>
              <Input type="number" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Conta bancária</Label>
              <Select value={contaId} onValueChange={(v) => setContaId(v ?? NONE)}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Todas</SelectItem>
                  {opcoes.contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento de</Label>
              <Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento até</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Centro de custo</Label>
              <Select value={centroId} onValueChange={(v) => setCentroId(v ?? NONE)}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Todos</SelectItem>
                  {opcoes.centros.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select value={projetoId} onValueChange={(v) => setProjetoId(v ?? NONE)}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Todos</SelectItem>
                  {opcoes.projetos.map((p) => <SelectItem key={p.id} value={p.id}>{formatarCodigo(p.codigo)} · {p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Observações</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending}>{pending ? "Criando…" : "Criar cenário"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
