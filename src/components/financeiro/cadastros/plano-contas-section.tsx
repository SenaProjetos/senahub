"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { criarCategoria, definirTipoCustoCategoria } from "@/modules/financeiro/cadastros/actions";
import { tipoCustoEfetivo, type TipoCusto } from "@/modules/financeiro/relatorios/indicadores-gerenciais";
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

type Cat = { id: string; codigo: string; nome: string; tipo: "receita" | "despesa"; paiId: string | null; tipoCusto: TipoCusto | null };

const HERDA = "__herda";
const ROTULO_CUSTO: Record<TipoCusto, string> = { fixo: "Fixo", variavel: "Variável" };

/** Custo da categoria mãe (o que "Herda" vale), subindo a árvore. */
function custoHerdado(c: Cat, porId: Map<string, Cat>): TipoCusto {
  const cadeia: (TipoCusto | null)[] = [];
  const vistos = new Set<string>([c.id]);
  for (let p = c.paiId ? porId.get(c.paiId) : undefined; p && !vistos.has(p.id); p = p.paiId ? porId.get(p.paiId) : undefined) {
    vistos.add(p.id);
    cadeia.push(p.tipoCusto);
  }
  return tipoCustoEfetivo(cadeia);
}

/**
 * Custo fixo ou variável de uma despesa — a base do ponto de equilíbrio em Indicadores. Grava na hora; "Herda" usa o
 * da categoria mãe (sem nada na cadeia, fixo).
 */
function SeletorCusto({ c, herdado }: { c: Cat; herdado: TipoCusto }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function mudar(v: string | null) {
    const tipoCusto = !v || v === HERDA ? null : (v as TipoCusto);
    if (tipoCusto === c.tipoCusto) return;
    start(async () => {
      const r = await definirTipoCustoCategoria({ id: c.id, tipoCusto });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }
  return (
    <Select value={c.tipoCusto ?? HERDA} onValueChange={mudar} disabled={pending}>
      <SelectTrigger className="h-7 w-44 text-xs" aria-label={`Custo de ${c.codigo} ${c.nome}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={HERDA}>Herda ({ROTULO_CUSTO[herdado].toLowerCase()})</SelectItem>
        <SelectItem value="fixo">Custo fixo</SelectItem>
        <SelectItem value="variavel">Custo variável</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function PlanoContasSection({ categorias }: { categorias: Cat[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"receita" | "despesa">("despesa");
  const [paiId, setPaiId] = useState("__none");
  const porId = new Map(categorias.map((c) => [c.id, c]));

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
      <p className="text-xs text-muted-foreground">
        Em cada despesa, diga se é <strong>custo fixo</strong> (existe com ou sem projeto: folha, aluguel) ou{" "}
        <strong>variável</strong> (acompanha o faturamento: projetistas, ART, impostos sobre a nota). É o que calcula o
        ponto de equilíbrio em Indicadores.
      </p>
      <ul className="divide-y rounded-sm border">
        {categorias.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-3 p-2.5 text-sm"
            style={{ paddingLeft: `${(c.codigo.split(".").length - 1) * 16 + 10}px` }}
          >
            <span className="font-mono text-xs text-muted-foreground">{c.codigo}</span>
            {/* Piso de largura: sem ele o nome encolhia até sumir sob o seletor; com ele, seletor e tipo descem de linha. */}
            <span className="min-w-[8rem] flex-1">{c.nome}</span>
            {c.tipo === "despesa" && <SeletorCusto c={c} herdado={custoHerdado(c, porId)} />}
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
