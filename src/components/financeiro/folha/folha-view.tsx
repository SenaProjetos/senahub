"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { pagarProjetista } from "@/modules/financeiro/folha/actions";
import type { FolhaItem } from "@/modules/financeiro/folha/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Folha de projetistas</h2>
        <p className="text-sm text-muted-foreground">
          Pagamentos liberados por entregas validadas.
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
                    <Badge
                      variant="outline"
                      className={
                        p.status === "pago"
                          ? "text-success border-success/40"
                          : p.status === "pendente"
                            ? "text-warning border-warning/40"
                            : ""
                      }
                    >
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.status === "pendente" && (
                      <Button size="sm" variant="outline" onClick={() => setPagar(p)}>
                        <Wallet className="size-3.5" /> Pagar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PagarDialog pagamento={pagar} onClose={() => setPagar(null)} contas={contas} formas={formas} />
    </div>
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
