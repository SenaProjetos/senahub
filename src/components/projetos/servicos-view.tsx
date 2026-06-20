"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { criarServico, editarServico, excluirServico } from "@/modules/projetos/servicos/actions";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl } from "@/lib/utils";

const NONE = "__none";

type Servico = { id: string; descricao: string; valor: number | null; status: string; fornecedorId: string | null; fornecedor: string | null };

export function ServicosView({
  projeto,
  servicos,
  fornecedores,
  podeGerir,
}: {
  projeto: { id: string; codigo: string; nome: string };
  servicos: Servico[];
  fornecedores: { id: string; nome: string }[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dlg, setDlg] = useState<Servico | null | "novo">(null);
  const [form, setForm] = useState({ descricao: "", fornecedorId: NONE, valor: "", status: "contratado" });

  function abrir(s: Servico | "novo") {
    if (!podeGerir) return;
    if (s === "novo") setForm({ descricao: "", fornecedorId: NONE, valor: "", status: "contratado" });
    else setForm({ descricao: s.descricao, fornecedorId: s.fornecedorId ?? NONE, valor: s.valor != null ? String(s.valor) : "", status: s.status });
    setDlg(s);
  }
  function salvar() {
    if (!dlg || !form.descricao.trim()) return;
    const payload = {
      projetoId: projeto.id,
      fornecedorId: form.fornecedorId === NONE ? "" : form.fornecedorId,
      descricao: form.descricao,
      valor: form.valor ? Number(form.valor) : undefined,
      status: form.status as "contratado" | "concluido" | "cancelado",
    };
    start(async () => {
      const r = dlg === "novo" ? await criarServico(payload) : await editarServico({ ...payload, id: dlg.id });
      if (r.ok) {
        toast.success("Serviço salvo.");
        setDlg(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function excluir(id: string) {
    start(async () => {
      const r = await excluirServico({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  const COR: Record<string, string> = {
    contratado: "border-info/40 text-info",
    concluido: "border-success/40 text-success",
    cancelado: "border-destructive/40 text-destructive",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/projetos/${projeto.id}`} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" /> {formatarCodigo(projeto.codigo)} · {projeto.nome}
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">Serviços terceirizados</h2>
          <p className="text-sm text-muted-foreground">Serviços externos contratados para o projeto.</p>
        </div>
        {podeGerir && (
          <Button size="sm" onClick={() => abrir("novo")}>
            <Plus className="size-3.5" /> Serviço
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {servicos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum serviço terceirizado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Descrição</th>
                  <th className="px-4 py-2">Fornecedor</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2">Status</th>
                  {podeGerir && <th className="px-4 py-2 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {servicos.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2">{s.descricao}</td>
                    <td className="px-4 py-2 text-muted-foreground">{s.fornecedor ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{s.valor != null ? brl(s.valor) : "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={`capitalize ${COR[s.status] ?? ""}`}>{s.status}</Badge>
                    </td>
                    {podeGerir && (
                      <td className="px-4 py-2 text-right">
                        <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => abrir(s)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(s.id)} disabled={pending}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dlg && dlg !== "novo" ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Sondagem SPT" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Select value={form.fornecedorId} onValueChange={(v) => setForm({ ...form, fornecedorId: v ?? NONE })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {fornecedores.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v ?? "contratado" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contratado">Contratado</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending || !form.descricao.trim()}>{pending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
