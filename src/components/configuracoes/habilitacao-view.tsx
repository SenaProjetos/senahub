"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, ListChecks, FileText } from "lucide-react";
import {
  salvarChecklistModelo,
  excluirChecklistModelo,
} from "@/modules/licitacoes/habilitacao/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type ModeloItem = { id: string; exigencia: string; obrigatorio: boolean; ordem: number };
type Modelo = { id: string; nome: string; ativo: boolean; ordem: number; itens: ModeloItem[] };

// ── Sub-componente por modelo (estado local isolado) ──────────────────────────
function ModeloEditor({ modelo }: { modelo: Modelo }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState(modelo.nome);
  const [ativo, setAtivo] = useState(modelo.ativo);
  const [itens, setItens] = useState<{ exigencia: string; obrigatorio: boolean }[]>(
    modelo.itens.map((it) => ({ exigencia: it.exigencia, obrigatorio: it.obrigatorio })),
  );

  function adicionarItem() {
    setItens((prev) => [...prev, { exigencia: "", obrigatorio: true }]);
  }

  function removerItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx));
  }

  function atualizarItem(idx: number, patch: Partial<{ exigencia: string; obrigatorio: boolean }>) {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function salvar() {
    const itensLimpos = itens
      .filter((it) => it.exigencia.trim().length > 0)
      .map((it) => ({ exigencia: it.exigencia, obrigatorio: it.obrigatorio }));
    start(async () => {
      const r = await salvarChecklistModelo({
        id: modelo.id,
        nome,
        ativo,
        ordem: modelo.ordem,
        itens: itensLimpos,
      });
      if (r.ok) {
        toast.success("Modelo salvo.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function excluir() {
    start(async () => {
      const r = await excluirChecklistModelo({ id: modelo.id });
      if (r.ok) {
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="h-8 max-w-72 font-medium"
            placeholder="Nome do modelo"
          />
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-sm select-none">
              <Checkbox
                checked={ativo}
                onCheckedChange={(checked) => setAtivo(checked as boolean)}
                disabled={pending}
              />
              Ativo
            </label>
            <Button
              size="sm"
              onClick={salvar}
              disabled={pending || !nome.trim()}
            >
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={excluir}
              disabled={pending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" /> Excluir
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {itens.length === 0 && (
          <EmptyState icon={ListChecks} title="Nenhuma exigência" />
        )}
        {itens.map((it, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={it.exigencia}
              onChange={(e) => atualizarItem(idx, { exigencia: e.target.value })}
              placeholder="Descrição da exigência"
              className="h-8 flex-1"
            />
            <label className="flex cursor-pointer items-center gap-1 text-xs select-none whitespace-nowrap">
              <Checkbox
                checked={it.obrigatorio}
                onCheckedChange={(checked) => atualizarItem(idx, { obrigatorio: checked as boolean })}
                disabled={pending}
              />
              Obrigatório
            </label>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remover exigência"
              onClick={() => removerItem(idx)}
              disabled={pending}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={adicionarItem} disabled={pending}>
          <Plus className="size-3.5" /> Exigência
        </Button>
      </CardContent>
    </Card>
  );
}

// ── View principal ────────────────────────────────────────────────────────────
export function HabilitacaoView({ modelos }: { modelos: Modelo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novoNome, setNovoNome] = useState("");

  function adicionar() {
    if (!novoNome.trim()) return;
    start(async () => {
      const r = await salvarChecklistModelo({ nome: novoNome, itens: [] });
      if (r.ok) {
        toast.success("Modelo adicionado.");
        setNovoNome("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/configuracoes"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Configurações
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Checklist de habilitação</h2>
        <p className="text-sm text-muted-foreground">
          Modelos de exigências de habilitação usados nas licitações.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Adicionar modelo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              placeholder="Nome do modelo"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
              className="flex-1 min-w-48"
            />
            <Button size="sm" onClick={adicionar} disabled={pending || !novoNome.trim()}>
              <Plus className="size-3.5" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {modelos.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum modelo" description="Adicione o primeiro modelo de checklist." />
      ) : (
        <div className="space-y-4">
          {modelos.map((m) => (
            <ModeloEditor key={m.id} modelo={m} />
          ))}
        </div>
      )}
    </div>
  );
}
