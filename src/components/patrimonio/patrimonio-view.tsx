"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package, Download, Search } from "lucide-react";
import { criarAtivo, editarAtivo, excluirAtivo } from "@/modules/patrimonio/actions";
import { STATUS_ATIVO, STATUS_ATIVO_LABEL } from "@/modules/patrimonio/schemas";
import type { AtivoListItem } from "@/modules/patrimonio/queries";
import { brl, formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const NONE = "__none";
const TODOS = "__todos";
const STATUS_TONE: Record<string, string> = {
  ativo: "text-success border-success/40",
  manutencao: "text-warning border-warning/40",
  baixado: "text-muted-foreground",
};

type FormState = {
  nome: string;
  categoria: string;
  localizacao: string;
  responsavelId: string;
  dataAquisicao: string;
  valor: string;
  status: (typeof STATUS_ATIVO)[number];
  observacao: string;
};
const vazio: FormState = { nome: "", categoria: "", localizacao: "", responsavelId: NONE, dataAquisicao: "", valor: "", status: "ativo", observacao: "" };

export function PatrimonioView({
  ativos,
  categorias,
  colaboradores,
  podeGerir,
}: {
  ativos: AtivoListItem[];
  categorias: string[];
  colaboradores: { id: string; name: string }[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [catFiltro, setCatFiltro] = useState(TODOS);
  const [statusFiltro, setStatusFiltro] = useState(TODOS);
  const [dialog, setDialog] = useState<null | "novo" | AtivoListItem>(null);
  const [form, setForm] = useState<FormState>(vazio);

  const filtrados = useMemo(() => {
    const termo = q.trim().toLowerCase();
    return ativos.filter((a) => {
      if (catFiltro !== TODOS && (a.categoria ?? "") !== catFiltro) return false;
      if (statusFiltro !== TODOS && a.status !== statusFiltro) return false;
      if (termo && !`${a.nome} ${a.categoria ?? ""} ${a.localizacao ?? ""}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [ativos, q, catFiltro, statusFiltro]);

  function abrir(alvo: "novo" | AtivoListItem) {
    if (alvo === "novo") setForm(vazio);
    else
      setForm({
        nome: alvo.nome,
        categoria: alvo.categoria ?? "",
        localizacao: alvo.localizacao ?? "",
        responsavelId: alvo.responsavelId ?? NONE,
        dataAquisicao: alvo.dataAquisicao ? new Date(alvo.dataAquisicao).toISOString().slice(0, 10) : "",
        valor: alvo.valor != null ? String(Number(alvo.valor)) : "",
        status: alvo.status as FormState["status"],
        observacao: alvo.observacao ?? "",
      });
    setDialog(alvo);
  }

  function salvar() {
    const payload = {
      nome: form.nome.trim(),
      categoria: form.categoria,
      localizacao: form.localizacao,
      responsavelId: form.responsavelId === NONE ? "" : form.responsavelId,
      dataAquisicao: form.dataAquisicao,
      valor: form.valor.trim() ? Number(form.valor) : null,
      status: form.status,
      observacao: form.observacao,
    };
    start(async () => {
      const r = dialog && dialog !== "novo" ? await editarAtivo({ ...payload, id: dialog.id }) : await criarAtivo(payload);
      if (r.ok) {
        toast.success(dialog === "novo" ? "Ativo criado." : "Ativo atualizado.");
        setDialog(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirAtivo({ id });
      if (r.ok) {
        toast.success("Ativo excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Patrimônio</h2>
          <p className="text-sm text-muted-foreground">{ativos.length} ativo(s) no inventário.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" render={<a href="/api/patrimonio/export" download />}>
            <Download className="size-4" /> Exportar XLSX
          </Button>
          {podeGerir && (
            <Button onClick={() => abrir("novo")}>
              <Plus className="size-4" /> Novo ativo
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-xs flex-1 items-center gap-2">
          <Input placeholder="Buscar por nome, categoria, local…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Search className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <Select value={catFiltro} onValueChange={(v) => setCatFiltro(v ?? TODOS)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas categorias</SelectItem>
            {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v ?? TODOS)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos status</SelectItem>
            {STATUS_ATIVO.map((s) => <SelectItem key={s} value={s}>{STATUS_ATIVO_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtrados.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Nenhum ativo"
              description="Cadastre equipamentos, mobiliário e demais bens do escritório."
              action={podeGerir ? <Button size="sm" onClick={() => abrir("novo")}><Plus className="size-3.5" /> Novo ativo</Button> : undefined}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                  <TableHead className="hidden md:table-cell">Local</TableHead>
                  <TableHead className="hidden lg:table-cell">Responsável</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  {podeGerir && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.nome}
                      {a.dataAquisicao && (
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          aquis. {formatarData(a.dataAquisicao)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{a.categoria ?? "—"}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{a.localizacao ?? "—"}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{a.responsavel?.name ?? "—"}</TableCell>
                    <TableCell className="hidden text-right font-mono text-sm lg:table-cell">{a.valor != null ? brl(Number(a.valor)) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_TONE[a.status] ?? ""}>{STATUS_ATIVO_LABEL[a.status] ?? a.status}</Badge>
                    </TableCell>
                    {podeGerir && (
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => abrir(a)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Excluir" disabled={pending} onClick={() => excluir(a.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog && dialog !== "novo" ? "Editar ativo" : "Novo ativo"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} placeholder="Computador, Mobiliário…" />
            </div>
            <div className="space-y-1.5">
              <Label>Localização</Label>
              <Input value={form.localizacao} onChange={(e) => setForm((f) => ({ ...f, localizacao: e.target.value }))} placeholder="Sala, andar…" />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={form.responsavelId} onValueChange={(v) => setForm((f) => ({ ...f, responsavelId: v ?? NONE }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {colaboradores.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: (v as FormState["status"]) ?? "ativo" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_ATIVO.map((s) => <SelectItem key={s} value={s}>{STATUS_ATIVO_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data de aquisição</Label>
              <Input type="date" value={form.dataAquisicao} onChange={(e) => setForm((f) => ({ ...f, dataAquisicao: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input type="number" min="0" step="0.01" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observação</Label>
              <textarea
                rows={2}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending || !form.nome.trim()}>{pending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
