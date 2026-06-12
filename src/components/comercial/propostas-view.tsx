"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Eye } from "lucide-react";
import { criarProposta } from "@/modules/comercial/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

type Proposta = {
  id: string;
  numero: string;
  titulo: string;
  cliente: string;
  status: string;
  total: number;
  visualizacoes: number;
  atualizadoEm: string;
};

export const STATUS_PROPOSTA_CHIP: Record<string, string> = {
  rascunho: "text-muted-foreground",
  enviada: "text-warning border-warning/40",
  aceita: "text-success border-success/40",
  recusada: "text-destructive border-destructive/40",
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PropostasView({
  propostas,
  clientes,
  podeGerir,
  status,
}: {
  propostas: Proposta[];
  clientes: { id: string; nome: string }[];
  podeGerir: boolean;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [clienteId, setClienteId] = useState("");

  function criar() {
    if (!titulo || !clienteId) {
      toast.error("Informe título e cliente.");
      return;
    }
    start(async () => {
      const r = await criarProposta({ titulo, clienteId, leadId: "" });
      if (r.ok) {
        toast.success(`Proposta ${r.data.numero} criada.`);
        setOpen(false);
        router.push(`/comercial/propostas/${r.data.id}`);
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Propostas</h2>
          <p className="text-sm text-muted-foreground">{propostas.length} proposta(s).</p>
        </div>
        {podeGerir && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Nova proposta
          </Button>
        )}
      </div>

      <Select
        value={status || "todas"}
        onValueChange={(v) =>
          router.push(!v || v === "todas" ? "/comercial/propostas" : `/comercial/propostas?status=${v}`)
        }
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todos os status</SelectItem>
          {["rascunho", "enviada", "aceita", "recusada"].map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <Eye className="size-3.5" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {propostas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhuma proposta.
                </TableCell>
              </TableRow>
            ) : (
              propostas.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/comercial/propostas/${p.id}`} className="hover:underline">
                      {p.numero}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/comercial/propostas/${p.id}`} className="hover:underline">
                      {p.titulo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.cliente}</TableCell>
                  <TableCell className="text-right font-mono">{brl(p.total)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_PROPOSTA_CHIP[p.status]}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.visualizacoes}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova proposta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={clienteId} onValueChange={(v) => setClienteId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={pending}>
              {pending ? "Criando…" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
