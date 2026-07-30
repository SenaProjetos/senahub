"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Power, PowerOff, ChevronDown, Trash2, Truck } from "lucide-react";
import {
  criarFornecedor,
  editarFornecedor,
  alternarFornecedor,
  criarRepresentante,
  removerRepresentante,
} from "@/modules/custos/fornecedores/actions";
import { buscarHistoricoPrecoFornecedor } from "@/modules/custos/cotacoes/actions";
import { CategoriaInsumo } from "@/generated/prisma/enums";
import type { HistoricoPrecoItem } from "@/modules/custos/cotacoes/queries";
import { brl, formatarData } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

const CATEGORIA_INSUMO_LABEL: Record<string, string> = {
  servicos: "Serviços",
  material: "Material",
  mao_de_obra: "Mão de obra",
  encargos_complementares: "Encargos complementares",
  equipamento: "Equipamento",
  especiais: "Especiais",
};
const CATEGORIAS_INSUMO = Object.values(CategoriaInsumo);

type Representante = { id: string; nome: string; cargo: string | null; telefone: string | null; email: string | null };
type Fornecedor = {
  id: string;
  tipo: "PF" | "PJ";
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
  ativo: boolean;
  representantes: Representante[];
  regioesAtendidas: string[];
  categoriasFornecidas: string[];
  prazoMedioDiasEntrega: number | null;
  condicoesComerciais: string | null;
  avaliacaoNota: number | null;
};

export function FornecedoresView({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Fornecedor | null>(null);
  const [, start] = useTransition();

  function alternar(f: Fornecedor) {
    start(async () => {
      const r = await alternarFornecedor({ id: f.id, ativo: !f.ativo });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Fornecedores</h2>
          <p className="text-sm text-muted-foreground">
            Cadastro de fornecedores de material/insumo pra cotações (RFQ) — independente do cadastro de
            fornecedores do financeiro.
          </p>
        </div>
        <Button
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Novo fornecedor
        </Button>
      </div>
      <ul className="divide-y rounded-sm border">
        {fornecedores.length === 0 ? (
          <li><EmptyState icon={Truck} title="Nenhum fornecedor." /></li>
        ) : (
          fornecedores.map((f) => (
            <FornRow
              key={f.id}
              f={f}
              onAlternar={() => alternar(f)}
              onEditar={() => {
                setEdit(f);
                setOpen(true);
              }}
            />
          ))
        )}
      </ul>
      <FornecedorDialog open={open} onOpenChange={setOpen} fornecedor={edit} />
    </div>
  );
}

function FornecedorDialog({
  open,
  onOpenChange,
  fornecedor,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fornecedor: Fornecedor | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const vazio = {
    tipo: "PJ" as const,
    nome: "",
    documento: "",
    email: "",
    telefone: "",
    observacoes: "",
    regioesAtendidas: "",
    categoriasFornecidas: [] as string[],
    prazoMedioDiasEntrega: "",
    condicoesComerciais: "",
    avaliacaoNota: "",
  };
  function formDe(f: Fornecedor | null) {
    if (!f) return vazio;
    return {
      tipo: f.tipo,
      nome: f.nome,
      documento: f.documento ?? "",
      email: f.email ?? "",
      telefone: f.telefone ?? "",
      observacoes: f.observacoes ?? "",
      regioesAtendidas: f.regioesAtendidas.join(", "),
      categoriasFornecidas: f.categoriasFornecidas,
      prazoMedioDiasEntrega: f.prazoMedioDiasEntrega != null ? String(f.prazoMedioDiasEntrega) : "",
      condicoesComerciais: f.condicoesComerciais ?? "",
      avaliacaoNota: f.avaliacaoNota != null ? String(f.avaliacaoNota) : "",
    };
  }
  const [form, setForm] = useState(formDe(fornecedor));
  const key = fornecedor?.id ?? "novo";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(formDe(fornecedor));
  }

  function alternarCategoria(cat: string) {
    setForm((f) => ({
      ...f,
      categoriasFornecidas: f.categoriasFornecidas.includes(cat)
        ? f.categoriasFornecidas.filter((c) => c !== cat)
        : [...f.categoriasFornecidas, cat],
    }));
  }

  function salvar() {
    start(async () => {
      const payload = {
        tipo: form.tipo,
        nome: form.nome,
        documento: form.documento,
        email: form.email,
        telefone: form.telefone,
        observacoes: form.observacoes,
        regioesAtendidas: form.regioesAtendidas
          .split(/[,\s]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
        categoriasFornecidas: form.categoriasFornecidas as never[],
        prazoMedioDiasEntrega: form.prazoMedioDiasEntrega ? Number(form.prazoMedioDiasEntrega) : undefined,
        condicoesComerciais: form.condicoesComerciais,
        avaliacaoNota: form.avaliacaoNota ? Number(form.avaliacaoNota) : undefined,
      };
      const r = fornecedor?.id
        ? await editarFornecedor({ ...payload, id: fornecedor.id })
        : await criarFornecedor(payload);
      if (r.ok) {
        toast.success("Fornecedor salvo.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fornecedor?.id ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: (v as "PF" | "PJ") ?? "PJ" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PJ">PJ</SelectItem>
                  <SelectItem value="PF">PF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Documento</Label>
              <Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t pt-3">
            <div className="space-y-1.5">
              <Label>Regiões atendidas (UF)</Label>
              <Input
                value={form.regioesAtendidas}
                onChange={(e) => setForm({ ...form, regioesAtendidas: e.target.value })}
                placeholder="PE, PB, RN"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo médio de entrega (dias)</Label>
              <Input
                type="number"
                min={0}
                value={form.prazoMedioDiasEntrega}
                onChange={(e) => setForm({ ...form, prazoMedioDiasEntrega: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categorias fornecidas</Label>
            <div className="flex flex-wrap gap-3">
              {CATEGORIAS_INSUMO.map((cat) => (
                <label key={cat} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={form.categoriasFornecidas.includes(cat)} onCheckedChange={() => alternarCategoria(cat)} />
                  {CATEGORIA_INSUMO_LABEL[cat] ?? cat}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Condições comerciais</Label>
              <Input
                value={form.condicoesComerciais}
                onChange={(e) => setForm({ ...form, condicoesComerciais: e.target.value })}
                placeholder="30/60/90 dias, à vista c/ desconto…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Avaliação (0–5)</Label>
              <Input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={form.avaliacaoNota}
                onChange={(e) => setForm({ ...form, avaliacaoNota: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || !form.nome}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FornRow({ f, onAlternar, onEditar }: { f: Fornecedor; onAlternar: () => void; onEditar: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [repNome, setRepNome] = useState("");
  const [repCargo, setRepCargo] = useState("");
  const [repTelefone, setRepTelefone] = useState("");
  const [historico, setHistorico] = useState<HistoricoPrecoItem[] | null>(null);

  useEffect(() => {
    if (aberto && historico === null) {
      buscarHistoricoPrecoFornecedor({ fornecedorId: f.id }).then((r) => {
        if (r.ok) setHistorico(r.data);
      });
    }
  }, [aberto, historico, f.id]);

  function addRepresentante() {
    if (!repNome.trim()) {
      toast.error("Informe o nome.");
      return;
    }
    start(async () => {
      const r = await criarRepresentante({
        fornecedorId: f.id,
        nome: repNome,
        cargo: repCargo || undefined,
        telefone: repTelefone || undefined,
      });
      if (r.ok) {
        toast.success("Representante adicionado.");
        setRepNome("");
        setRepCargo("");
        setRepTelefone("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function rmRepresentante(id: string) {
    start(async () => {
      const r = await removerRepresentante({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <li className={`p-3 ${f.ativo ? "" : "opacity-60"}`}>
      <div className="flex items-center justify-between gap-2">
        <button className="min-w-0 text-left" onClick={() => setAberto(!aberto)}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
            {f.nome} <Badge variant="outline">{f.tipo}</Badge>
          </p>
          <p className="pl-5 text-xs text-muted-foreground">
            {f.documento ?? "—"}
            {f.telefone ? ` · ${f.telefone}` : ""}
          </p>
        </button>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onAlternar} aria-label="Ativar/Desativar">
            {f.ativo ? <PowerOff className="size-4" /> : <Power className="size-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onEditar} aria-label="Editar">
            <Pencil className="size-4" />
          </Button>
        </div>
      </div>

      {aberto && (
        <div className="mt-2 space-y-3 border-t pt-2">
          {(f.regioesAtendidas.length > 0 || f.categoriasFornecidas.length > 0 || f.avaliacaoNota != null || f.prazoMedioDiasEntrega != null) && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {f.regioesAtendidas.length > 0 && <span>UF: {f.regioesAtendidas.join(", ")}</span>}
              {f.categoriasFornecidas.length > 0 && (
                <span>Categorias: {f.categoriasFornecidas.map((c) => CATEGORIA_INSUMO_LABEL[c] ?? c).join(", ")}</span>
              )}
              {f.prazoMedioDiasEntrega != null && <span>Prazo médio: {f.prazoMedioDiasEntrega}d</span>}
              {f.avaliacaoNota != null && <span>Avaliação: {f.avaliacaoNota.toFixed(1)}/5</span>}
            </p>
          )}

          <div className="space-y-1 border-t pt-2">
            <Label className="text-xs text-muted-foreground">Representantes</Label>
            {f.representantes.length > 0 && (
              <ul className="divide-y text-xs">
                {f.representantes.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-1">
                    <span>
                      {r.nome}
                      {r.cargo ? ` — ${r.cargo}` : ""}
                      {r.telefone ? ` · ${r.telefone}` : ""}
                    </span>
                    <button onClick={() => rmRepresentante(r.id)} aria-label="Remover representante" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Input placeholder="Nome" value={repNome} onChange={(e) => setRepNome(e.target.value)} className="min-w-32 flex-1" />
              <Input placeholder="Cargo" value={repCargo} onChange={(e) => setRepCargo(e.target.value)} className="w-32" />
              <Input placeholder="Telefone" value={repTelefone} onChange={(e) => setRepTelefone(e.target.value)} className="w-32" />
              <Button size="sm" variant="outline" onClick={addRepresentante} disabled={pending}>
                <Plus className="size-3.5" /> Representante
              </Button>
            </div>
          </div>

          <div className="space-y-1 border-t pt-2">
            <Label className="text-xs text-muted-foreground">Histórico de preço (cotações vencedoras)</Label>
            {historico === null ? (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            ) : historico.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum preço histórico ainda — vence uma RFQ com este fornecedor pra começar.</p>
            ) : (
              <ul className="space-y-0.5 text-xs">
                {historico.map((h) => (
                  <li key={h.id} className="flex items-center gap-2">
                    <span className="font-mono">{brl(h.valor)}</span>
                    <span className="text-muted-foreground">
                      {h.descricao} · {formatarData(h.data)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
