"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, RotateCcw, Check, X, Tags } from "lucide-react";
import {
  salvarModalidade,
  alternarModalidade,
  excluirModalidade,
  restaurarModalidadesPadrao,
} from "@/modules/licitacoes/modalidades/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type Modalidade = { id: string; nome: string; ordem: number; ativo: boolean };

export function ModalidadesView({ modalidades }: { modalidades: Modalidade[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");

  function adicionar() {
    if (!nome.trim()) return;
    start(async () => {
      const r = await salvarModalidade({ nome });
      if (r.ok) {
        toast.success("Modalidade adicionada.");
        setNome("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function salvarEdicao(id: string) {
    if (!editNome.trim()) return;
    start(async () => {
      const r = await salvarModalidade({ id, nome: editNome });
      if (r.ok) {
        toast.success("Modalidade atualizada.");
        setEditId(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function alternar(id: string, ativo: boolean) {
    start(async () => {
      const r = await alternarModalidade({ id, ativo });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }
  function remover(id: string) {
    start(async () => {
      const r = await excluirModalidade({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }
  function restaurar() {
    start(async () => {
      const r = await restaurarModalidadesPadrao({});
      if (r.ok) {
        toast.success(`${r.data.total} modalidades padrão garantidas.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/configuracoes" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> Configurações
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Modalidades de licitação</h2>
        <p className="text-sm text-muted-foreground">
          Lista usada no cadastro/edição de licitações. Desative para esconder do select sem apagar.
        </p>
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={restaurar} disabled={pending}>
          <RotateCcw className="size-3.5" /> Restaurar padrão
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Adicionar modalidade</CardTitle>
          <CardDescription>Ex.: Pregão, Concorrência, Dispensa…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              placeholder="Nome da modalidade"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
              className="flex-1 min-w-48"
            />
            <Button size="sm" onClick={adicionar} disabled={pending || !nome.trim()}>
              <Plus className="size-3.5" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{modalidades.length} modalidade(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {modalidades.length === 0 ? (
            <EmptyState icon={Tags} title="Nenhuma modalidade" description="Use “Restaurar padrão” para recriar as modalidades." />
          ) : (
            <ul className="divide-y text-sm">
              {modalidades.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  {editId === m.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && salvarEdicao(m.id)}
                        className="h-8 max-w-64"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" aria-label="Salvar" onClick={() => salvarEdicao(m.id)} disabled={pending}>
                        <Check className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Cancelar" onClick={() => setEditId(null)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="flex items-center gap-2 text-left"
                      onClick={() => {
                        setEditId(m.id);
                        setEditNome(m.nome);
                      }}
                    >
                      <span className={m.ativo ? "" : "text-muted-foreground line-through"}>{m.nome}</span>
                      {!m.ativo && <Badge variant="outline" className="text-muted-foreground">inativa</Badge>}
                    </button>
                  )}
                  {editId !== m.id && (
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => alternar(m.id, !m.ativo)} disabled={pending}>
                        {m.ativo ? "Desativar" : "Ativar"}
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => remover(m.id)} disabled={pending}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
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
