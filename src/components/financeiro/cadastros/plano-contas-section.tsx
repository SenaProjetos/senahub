"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { criarCategoria } from "@/modules/financeiro/cadastros/actions";
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

type Cat = { id: string; codigo: string; nome: string; tipo: "receita" | "despesa"; paiId: string | null };

export function PlanoContasSection({ categorias }: { categorias: Cat[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"receita" | "despesa">("despesa");
  const [paiId, setPaiId] = useState("__none");

  function adicionar() {
    if (!codigo.trim() || !nome.trim()) {
      toast.error("Informe código e nome.");
      return;
    }
    start(async () => {
      const r = await criarCategoria({
        codigo,
        nome,
        tipo,
        paiId: paiId === "__none" ? undefined : paiId,
      });
      if (r.ok) {
        toast.success("Conta adicionada.");
        setCodigo("");
        setNome("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-sm border">
        {categorias.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 p-2.5 text-sm"
            style={{ paddingLeft: `${(c.codigo.split(".").length - 1) * 16 + 10}px` }}
          >
            <span className="font-mono text-xs text-muted-foreground">{c.codigo}</span>
            <span className="flex-1">{c.nome}</span>
            <Badge
              variant="outline"
              className={
                c.tipo === "receita"
                  ? "text-status-aprovado border-status-aprovado/40"
                  : "text-status-revisao border-status-revisao/40"
              }
            >
              {c.tipo}
            </Badge>
          </li>
        ))}
      </ul>

      <div className="space-y-2 rounded-sm border border-dashed p-3">
        <Label className="text-xs text-muted-foreground">Nova conta</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Código (2.09)"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="w-32"
          />
          <Input
            placeholder="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="flex-1"
          />
          <Select value={tipo} onValueChange={(v) => setTipo((v as "receita" | "despesa") ?? "despesa")}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="receita">Receita</SelectItem>
              <SelectItem value="despesa">Despesa</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paiId} onValueChange={(v) => setPaiId(v ?? "__none")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Conta-pai" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sem pai (raiz)</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.codigo} {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={adicionar} disabled={pending}>
            <Plus className="size-4" /> Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}
