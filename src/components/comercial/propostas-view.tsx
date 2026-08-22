"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Eye, FileSignature } from "lucide-react";
import { criarProposta } from "@/modules/comercial/actions";
import { STATUS_PROPOSTA_LABEL } from "@/modules/comercial/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
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
import { EmptyState } from "@/components/ui/empty-state";
import { brl } from "@/lib/utils";

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

type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_PROPOSTA_TONE: Record<string, StatusTone> = {
  rascunho: "neutral",
  enviada: "warning",
  // F5.5 — "info" (não "warning"): já saiu da fila de espera, tem resposta do cliente. Cor
  // própria pra não confundir com "enviada, aguardando" na mesma lista.
  em_negociacao: "info",
  aceita: "success",
  recusada: "danger",
};

const SEM_NEGOCIACAO = "nenhuma";

export function PropostasView({
  propostas,
  clientes,
  negociacoes,
  podeGerir,
  status,
}: {
  propostas: Proposta[];
  clientes: { id: string; nome: string }[];
  /** F5.3 — só as que ainda podem receber proposta nova (ver `negociacoesParaSelecao`). */
  negociacoes: { id: string; titulo: string; clienteId: string }[];
  podeGerir: boolean;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [negociacaoId, setNegociacaoId] = useState(SEM_NEGOCIACAO);

  // Escopada ao cliente escolhido — trocar de cliente sem trocar a negociação selecionada
  // mandaria uma negociação de outra empresa, que a action recusa mas a tela não deveria nem
  // oferecer.
  const negociacoesDoCliente = negociacoes.filter((n) => n.clienteId === clienteId);

  function escolherCliente(v: string) {
    setClienteId(v);
    setNegociacaoId(SEM_NEGOCIACAO);
  }

  function criar() {
    if (!titulo || !clienteId) {
      toast.error("Informe título e cliente.");
      return;
    }
    if (negociacaoId === SEM_NEGOCIACAO) {
      toast.error("Selecione a negociação — toda proposta nova nasce de uma (F5.3).");
      return;
    }
    start(async () => {
      const r = await criarProposta({ titulo, clienteId, negociacaoId });
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
          {(["rascunho", "enviada", "em_negociacao", "aceita", "recusada"] as const).map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_PROPOSTA_LABEL[s]}
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
                <TableCell colSpan={6}>
                  <EmptyState icon={FileSignature} title="Nenhuma proposta" />
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
                    <StatusBadge tone={STATUS_PROPOSTA_TONE[p.status] ?? "neutral"}>
                      {STATUS_PROPOSTA_LABEL[p.status as keyof typeof STATUS_PROPOSTA_LABEL] ?? p.status}
                    </StatusBadge>
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
              <Select value={clienteId} onValueChange={(v) => escolherCliente(v ?? "")}>
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
            {/* F5.3 — toda proposta nova nasce de uma negociação; sem isto a action recusa. */}
            <div className="space-y-1.5">
              <Label>Negociação</Label>
              <Select
                value={negociacaoId}
                onValueChange={(v) => setNegociacaoId(v ?? SEM_NEGOCIACAO)}
                disabled={!clienteId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={clienteId ? "Selecione…" : "Escolha o cliente primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_NEGOCIACAO} disabled>
                    — selecione —
                  </SelectItem>
                  {negociacoesDoCliente.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clienteId && negociacoesDoCliente.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Este cliente não tem negociação em aberto — qualifique uma prospecção antes.
                </p>
              )}
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
