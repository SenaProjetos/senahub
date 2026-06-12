"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { criarSocio, removerSocio } from "@/modules/financeiro/cadastros/actions";
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

type Socio = { id: string; nome: string; percentual: number };
type Usuario = { id: string; name: string };

export function SociosSection({ socios, usuarios }: { socios: Socio[]; usuarios: Usuario[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [percentual, setPercentual] = useState("");

  const total = socios.reduce((s, x) => s + x.percentual, 0);

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
          <li className="p-3 text-sm text-muted-foreground">Nenhum sócio.</li>
        ) : (
          socios.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 p-3">
              <span className="text-sm font-medium">{s.nome}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm">{s.percentual.toFixed(2)}%</span>
                <Button size="icon" variant="ghost" onClick={() => remover(s.id)} aria-label="Remover">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))
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
