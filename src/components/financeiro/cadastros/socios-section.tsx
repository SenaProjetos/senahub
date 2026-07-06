"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, Wallet, Users } from "lucide-react";
import {
  criarSocio,
  removerSocio,
  criarRetiradaSocio,
  removerRetiradaSocio,
} from "@/modules/financeiro/cadastros/actions";
import { brl, formatarData } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Retirada = { id: string; data: string; valor: number; tipo: string; observacao: string | null };
type Socio = { id: string; nome: string; ativo: boolean; percentual: number; retiradas: Retirada[] };
type Usuario = { id: string; name: string };

const TIPO_RET: Record<string, string> = { pro_labore: "Pró-labore", distribuicao: "Distribuição", adiantamento: "Adiantamento" };

export function SociosSection({ socios, usuarios }: { socios: Socio[]; usuarios: Usuario[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [percentual, setPercentual] = useState("");

  // Participação só conta sócios ativos (inativos ficam visíveis pelo histórico de retiradas).
  const total = socios.filter((x) => x.ativo).reduce((s, x) => s + x.percentual, 0);

  function adicionar() {
    if (!userId || !percentual) {
      toast.error("Selecione o sócio e o percentual.");
      return;
    }
    start(async () => {
      const r = await criarSocio({ userId, percentual: Number(percentual) });
      if (r.ok) {
        toast.success("Sócio adicionado.");
        setUserId("");
        setPercentual("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function remover(id: string) {
    start(async () => {
      const r = await removerSocio({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-sm border">
        {socios.length === 0 ? (
          <li><EmptyState icon={Users} title="Nenhum sócio." /></li>
        ) : (
          socios.map((s) => <SocioRow key={s.id} s={s} onRemover={remover} />)
        )}
      </ul>
      <p className={`text-xs ${total > 100 ? "text-destructive" : "text-muted-foreground"}`}>
        Participação total: {total.toFixed(2)}%
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-sm border border-dashed p-3">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Sócio</Label>
          <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-28 space-y-1.5">
          <Label className="text-xs text-muted-foreground">%</Label>
          <Input
            type="number"
            value={percentual}
            onChange={(e) => setPercentual(e.target.value)}
          />
        </div>
        <Button onClick={adicionar} disabled={pending}>
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>
    </div>
  );
}

function SocioRow({ s, onRemover }: { s: Socio; onRemover: (id: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ data: "", valor: "", tipo: "pro_labore", observacao: "" });
  const totalRet = s.retiradas.reduce((a, r) => a + r.valor, 0);

  function addRetirada() {
    if (!form.data || !form.valor) {
      toast.error("Informe data e valor.");
      return;
    }
    start(async () => {
      const r = await criarRetiradaSocio({
        socioId: s.id,
        data: form.data,
        valor: Number(form.valor),
        tipo: form.tipo as "pro_labore" | "distribuicao" | "adiantamento",
        observacao: form.observacao,
      });
      if (r.ok) {
        toast.success("Retirada registrada.");
        setForm({ data: "", valor: "", tipo: "pro_labore", observacao: "" });
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function rmRetirada(id: string) {
    start(async () => {
      const r = await removerRetiradaSocio({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <li className="p-3">
      <div className="flex items-center justify-between gap-2">
        <button className="inline-flex items-center gap-1.5 text-left" onClick={() => setAberto(!aberto)}>
          <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
          <span className="text-sm font-medium">{s.nome}</span>
          {!s.ativo && (
            <span className="rounded-sm border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              Inativo
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Wallet className="size-3" /> {s.retiradas.length} · {brl(totalRet)}
          </span>
        </button>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm">{s.percentual.toFixed(2)}%</span>
          <Button size="icon" variant="ghost" onClick={() => onRemover(s.id)} aria-label="Remover">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {aberto && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {s.retiradas.length > 0 && (
            <ul className="divide-y text-xs">
              {s.retiradas.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-muted-foreground">
                    {formatarData(r.data)} · {TIPO_RET[r.tipo] ?? r.tipo}
                    {r.observacao ? ` · ${r.observacao}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{brl(r.valor)}</span>
                    <button onClick={() => rmRetirada(r.id)} aria-label="Remover retirada" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className="w-36" />
            <Input type="number" step="0.01" placeholder="Valor" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="w-28" />
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v ?? "pro_labore" })}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pro_labore">Pró-labore</SelectItem>
                <SelectItem value="distribuicao">Distribuição</SelectItem>
                <SelectItem value="adiantamento">Adiantamento</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Obs." value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} className="w-32 flex-1" />
            <Button size="sm" variant="outline" onClick={addRetirada} disabled={pending}>
              <Plus className="size-3.5" /> Retirada
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
