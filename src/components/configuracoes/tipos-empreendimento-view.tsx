"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Building, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  alternarTipoEmpreendimento,
  excluirTipoEmpreendimento,
  moverTipoEmpreendimento,
  salvarTipoEmpreendimento,
} from "@/modules/projetos/tipos-empreendimento/actions";
import { SIGLAS_PADRAO } from "@/modules/projetos/etapas-padrao";
import { MOTIVO_SEM_FASE, motivoNaoExcluir } from "@/modules/projetos/tipos-empreendimento/regras";
import type { FaseDoCatalogoItem, TipoEmpreendimentoItem } from "@/modules/projetos/tipos-empreendimento/queries";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Tipos de empreendimento (Configurações): nome, etapas em que a disciplina NASCE, ativo e ordem — sem SQL.
 * Só vale para disciplinas criadas depois; as que já existem não mudam.
 */
export function TiposEmpreendimentoView({ tipos, fases }: { tipos: TipoEmpreendimentoItem[]; fases: FaseDoCatalogoItem[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const padrao = fases.filter((f) => SIGLAS_PADRAO.includes(f.sigla)).map((f) => f.id);

  const [nome, setNome] = useState("");
  const [etapas, setEtapas] = useState<string[]>(padrao);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editEtapas, setEditEtapas] = useState<string[]>([]);

  const alternarFase = (lista: string[], id: string) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  function executar(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string, depois?: () => void) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (ok) toast.success(ok);
        depois?.();
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível salvar.");
    });
  }

  function adicionar() {
    executar(() => salvarTipoEmpreendimento({ nome, etapasPadraoIds: etapas }), "Tipo adicionado.", () => {
      setNome("");
      setEtapas(padrao);
    });
  }

  function salvarEdicao(id: string) {
    executar(() => salvarTipoEmpreendimento({ id, nome: editNome, etapasPadraoIds: editEtapas }), "Tipo atualizado.", () => setEditId(null));
  }

  // O confirm vem ANTES do start: dentro da transition o setState do diálogo suspende e trava a tela.
  async function excluir(t: TipoEmpreendimentoItem) {
    const ok = await confirm({
      title: `Excluir o tipo "${t.nome}"?`,
      description: "Some do cadastro de vez. Se só quer tirá-lo da lista de escolha, desative.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    executar(() => excluirTipoEmpreendimento({ id: t.id }), "Tipo excluído.");
  }

  const chips = (selecionadas: string[], onToggle: (id: string) => void) => (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapas em que a disciplina nasce">
      {fases.map((f) => {
        const marcada = selecionadas.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={marcada}
            onClick={() => onToggle(f.id)}
            title={f.nome}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              marcada ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground hover:border-primary/50",
            )}
          >
            <span className="font-mono font-bold">{f.sigla}</span> {f.nome}
          </button>
        );
      })}
    </div>
  );

  const siglasDe = (ids: string[]) => fases.filter((f) => ids.includes(f.id)).map((f) => f.sigla);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Tipos de empreendimento"
        descricao="Classificam o projeto e definem em quais etapas a disciplina nasce. Mudanças valem só para disciplinas criadas depois."
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Adicionar tipo</CardTitle>
          <CardDescription>Ex.: Residencial unifamiliar, Hospital, Retrofit… Marque as etapas em que a disciplina já nasce.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Nome do tipo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && etapas.length > 0 && adicionar()}
            className="max-w-md"
            aria-label="Nome do tipo"
          />
          {chips(etapas, (id) => setEtapas((l) => alternarFase(l, id)))}
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={adicionar} disabled={pending || !nome.trim() || etapas.length === 0}>
              <Plus className="size-3.5" /> Adicionar
            </Button>
            {etapas.length === 0 && <span className="text-xs text-muted-foreground">{MOTIVO_SEM_FASE}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{tipos.length} tipo(s)</CardTitle>
          <CardDescription>A ordem aqui é a ordem das opções no cadastro de projeto.</CardDescription>
        </CardHeader>
        <CardContent>
          {tipos.length === 0 ? (
            <EmptyState icon={Building} title="Nenhum tipo cadastrado" description="Adicione o primeiro acima." />
          ) : (
            <ul className="divide-y text-sm">
              {tipos.map((t, i) => {
                const motivoExcluir = motivoNaoExcluir(t.uso);
                const editando = editId === t.id;
                return (
                  <li key={t.id} className="space-y-2 py-3">
                    {editando ? (
                      <div className="space-y-3">
                        <Input
                          value={editNome}
                          onChange={(e) => setEditNome(e.target.value)}
                          className="max-w-md"
                          aria-label={`Nome do tipo ${t.nome}`}
                          autoFocus
                        />
                        {chips(editEtapas, (id) => setEditEtapas((l) => alternarFase(l, id)))}
                        {editEtapas.length === 0 && <p className="text-xs text-destructive">{MOTIVO_SEM_FASE}</p>}
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => salvarEdicao(t.id)} disabled={pending || !editNome.trim() || editEtapas.length === 0}>
                            <Check className="size-3.5" /> Salvar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                            <X className="size-3.5" /> Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="flex shrink-0 flex-col">
                          <Button size="icon-xs" variant="ghost" aria-label={`Subir ${t.nome}`} disabled={pending || i === 0} onClick={() => executar(() => moverTipoEmpreendimento({ id: t.id, direcao: "cima" }))}>
                            <ArrowUp className="size-3" />
                          </Button>
                          <Button size="icon-xs" variant="ghost" aria-label={`Descer ${t.nome}`} disabled={pending || i === tipos.length - 1} onClick={() => executar(() => moverTipoEmpreendimento({ id: t.id, direcao: "baixo" }))}>
                            <ArrowDown className="size-3" />
                          </Button>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("font-medium", !t.ativo && "text-muted-foreground line-through")}>{t.nome}</span>
                            {!t.ativo && <Badge variant="outline" className="text-muted-foreground">inativo</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Nasce com: <span className="font-mono">{siglasDe(t.etapasEfetivasIds).join(" · ") || "—"}</span>
                            {t.etapasPadraoIds.length === 0 && " (padrão do sistema)"}
                            {t.uso.projetos > 0 && ` · ${t.uso.projetos} projeto(s)`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => {
                              setEditId(t.id);
                              setEditNome(t.nome);
                              setEditEtapas(t.etapasEfetivasIds);
                            }}
                          >
                            <Pencil className="size-3.5" /> Editar
                          </Button>
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => executar(() => alternarTipoEmpreendimento({ id: t.id, ativo: !t.ativo }))}>
                            {t.ativo ? "Desativar" : "Ativar"}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Excluir ${t.nome}`}
                            title={motivoExcluir ?? "Excluir"}
                            disabled={pending || motivoExcluir != null}
                            onClick={() => void excluir(t)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
