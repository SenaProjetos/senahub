"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Check, X, Funnel } from "lucide-react";
import {
  criarEtapaFunil,
  editarEtapaFunil,
  alternarEtapaFunil,
} from "@/modules/comercial/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { EtapaFunilConfig } from "@/modules/comercial/queries";

export function FunilEtapasView({ etapas }: { etapas: EtapaFunilConfig[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCor, setEditCor] = useState("");

  function adicionar() {
    if (!nome.trim()) return;
    start(async () => {
      const r = await criarEtapaFunil({ nome, cor });
      if (r.ok) {
        toast.success("Etapa criada.");
        setNome("");
        setCor("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function salvarEdicao(id: string) {
    if (!editNome.trim()) return;
    start(async () => {
      const r = await editarEtapaFunil({ id, nome: editNome, cor: editCor });
      if (r.ok) {
        toast.success("Etapa atualizada.");
        setEditId(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function alternar(id: string) {
    start(async () => {
      const r = await alternarEtapaFunil({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
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
        <h2 className="text-2xl font-extrabold tracking-tight">Etapas do funil comercial</h2>
        <p className="text-sm text-muted-foreground">
          Estágios do pipeline de vendas. Desative etapas sem remover histórico de leads.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Nova etapa</CardTitle>
          <CardDescription>Ex.: Qualificação, Proposta enviada, Em negociação…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              placeholder="Nome da etapa"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
              className="min-w-48 flex-1"
            />
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={cor || "#576980"}
                onChange={(e) => setCor(e.target.value)}
                className="size-8 cursor-pointer rounded border"
                title="Cor da etapa"
              />
              <span className="text-xs text-muted-foreground">Cor</span>
            </div>
            <Button size="sm" onClick={adicionar} disabled={pending || !nome.trim()}>
              <Plus className="size-3.5" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{etapas.length} etapa(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {etapas.length === 0 ? (
            <EmptyState icon={Funnel} title="Nenhuma etapa" description="Adicione a primeira etapa do funil." />
          ) : (
            <ul className="divide-y text-sm">
              {etapas.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                  {editId === e.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        value={editNome}
                        onChange={(ev) => setEditNome(ev.target.value)}
                        onKeyDown={(ev) => ev.key === "Enter" && salvarEdicao(e.id)}
                        className="h-8 max-w-56"
                        autoFocus
                      />
                      <input
                        type="color"
                        value={editCor || "#576980"}
                        onChange={(ev) => setEditCor(ev.target.value)}
                        className="size-7 cursor-pointer rounded border"
                        title="Cor"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Salvar"
                        onClick={() => salvarEdicao(e.id)}
                        disabled={pending}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Cancelar"
                        onClick={() => setEditId(null)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="flex items-center gap-2 text-left"
                      onClick={() => {
                        setEditId(e.id);
                        setEditNome(e.nome);
                        setEditCor(e.cor ?? "");
                      }}
                    >
                      {e.cor && (
                        <span
                          className="inline-block size-3 rounded-full border"
                          style={{ background: e.cor }}
                        />
                      )}
                      <span className={e.ativo ? "" : "text-muted-foreground line-through"}>
                        {e.nome}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({e._count.leads} lead{e._count.leads !== 1 ? "s" : ""})
                      </span>
                      {!e.ativo && (
                        <Badge variant="outline" className="text-muted-foreground">
                          inativa
                        </Badge>
                      )}
                    </button>
                  )}
                  {editId !== e.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => alternar(e.id)}
                      disabled={pending}
                    >
                      {e.ativo ? "Desativar" : "Ativar"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
