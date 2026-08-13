"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet, Pencil, Ban } from "lucide-react";
import {
  pagarProjetista,
  editarPagamentoProjetista,
  cancelarPagamentoProjetista,
} from "@/modules/financeiro/folha/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { FolhaItem } from "@/modules/financeiro/folha/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { brl } from "@/lib/utils";

const NONE = "__none";

export function FolhaView({
  itens,
  pendente,
  pago,
  contas,
  formas,
}: {
  itens: FolhaItem[];
  pendente: number;
  pago: number;
  contas: { id: string; nome: string }[];
  formas: { id: string; nome: string }[];
}) {
  const [pagar, setPagar] = useState<FolhaItem | null>(null);
  const [editar, setEditar] = useState<FolhaItem | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Produção</h2>
        <p className="text-sm text-muted-foreground">
          Pagamentos de projetistas PJ/freelancer liberados por entregas validadas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
              A pagar
            </CardDescription>
            <CardTitle className="text-2xl text-warning">{brl(pendente)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Pago
            </CardDescription>
            <CardTitle className="text-2xl text-success">{brl(pago)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Projetista</TableHead>
              <TableHead>Disciplina / Projeto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState icon={Wallet} title="Nenhum pagamento." />
                </TableCell>
              </TableRow>
            ) : (
              itens.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.projetista.name}</TableCell>
                  <TableCell className="text-sm">
                    {p.disciplina.nome}
                    <span className="block text-xs text-muted-foreground">
                      {formatarCodigo(p.disciplina.projeto.codigo)} · {p.disciplina.projeto.nome}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.tipoProfissional}</TableCell>
                  <TableCell className="text-right font-mono">{brl(Number(p.valor))}</TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={
                        p.status === "pago"
                          ? "success"
                          : p.status === "pendente"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {p.status}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {p.status === "pendente" && (
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => setPagar(p)}>
                          <Wallet className="size-3.5" /> Pagar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="px-2"
                          title="Editar valor"
                          onClick={() => setEditar(p)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <CancelarPagamentoButton pagamento={p} />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PagarDialog pagamento={pagar} onClose={() => setPagar(null)} contas={contas} formas={formas} />
      <EditarValorDialog pagamento={editar} onClose={() => setEditar(null)} />
    </div>
  );
}

/**
 * Botão de cancelar direto na folha — confirmação via `useConfirm` (padrão do repo,
 * evita mais um dialog controlado). Só aparece em pendentes; a action recusa o resto.
 */
function CancelarPagamentoButton({ pagamento }: { pagamento: FolhaItem }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  function cancelar() {
    start(async () => {
      const ok = await confirm({
        title: "Cancelar pagamento",
        description: `${pagamento.projetista.name} — ${brl(Number(pagamento.valor))}. A linha sai do "a pagar" e não pode ser desfeita por aqui.`,
        confirmLabel: "Cancelar pagamento",
        variant: "destructive",
      });
      if (!ok) return;
      const r = await cancelarPagamentoProjetista({ id: pagamento.id });
      if (r.ok) {
        toast.success("Pagamento cancelado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Button size="sm" variant="ghost" className="px-2 text-destructive" title="Cancelar pagamento" onClick={cancelar} disabled={pending}>
      <Ban className="size-3.5" />
    </Button>
  );
}

/**
 * Corrige o valor de um pagamento pendente — a rota de conserto para as linhas de
 * R$ 0,00 que já existem em produção (F3 sincroniza a partir da disciplina; esta é a
 * via direta, para quando a disciplina já não existe mais editável ou o ajuste é só
 * no pagamento). Zerar não é permitido aqui — use "Cancelar".
 */
function EditarValorDialog({ pagamento, onClose }: { pagamento: FolhaItem | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [valor, setValor] = useState("");

  // Aberto imperativamente (botão de lápis na linha, não um DialogTrigger interno) —
  // `onOpenChange` só dispara ao FECHAR, então o valor precisa ser sincronizado aqui.
  useEffect(() => {
    if (pagamento) setValor(String(Number(pagamento.valor)));
  }, [pagamento]);

  function salvar() {
    if (!pagamento) return;
    const num = Number(valor);
    if (!(num > 0)) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    start(async () => {
      const r = await editarPagamentoProjetista({ id: pagamento.id, valor: num });
      if (r.ok) {
        toast.success("Valor atualizado.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!pagamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar valor do pagamento</DialogTitle>
          <DialogDescription>{pagamento?.projetista.name} — {pagamento?.disciplina.nome}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="valor-pagamento">Valor (R$)</Label>
          <Input
            id="valor-pagamento"
            type="number"
            min="0.01"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PagarDialog({
  pagamento,
  onClose,
  contas,
  formas,
}: {
  pagamento: FolhaItem | null;
  onClose: () => void;
  contas: { id: string; nome: string }[];
  formas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const hoje = new Date().toISOString().slice(0, 10);
  const [contaId, setContaId] = useState(NONE);
  const [formaId, setFormaId] = useState(NONE);
  const [data, setData] = useState(hoje);

  function efetivar() {
    if (!pagamento) return;
    start(async () => {
      const r = await pagarProjetista({
        id: pagamento.id,
        contaId: contaId === NONE ? "" : contaId,
        formaId: formaId === NONE ? "" : formaId,
        data,
      });
      if (r.ok) {
        toast.success("Pagamento efetivado — lançamento criado no caixa.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!pagamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Efetivar pagamento</DialogTitle>
          <DialogDescription>
            {pagamento?.projetista.name} — {brl(Number(pagamento?.valor ?? 0))}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={contaId} onValueChange={(v) => setContaId(v ?? NONE)}>
                <SelectTrigger>
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
                <SelectTrigger>
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
          <div className="space-y-1.5">
            <Label>Data do pagamento</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={efetivar} disabled={pending}>
            {pending ? "Pagando…" : "Efetivar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
