"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, X, Check, NotebookPen } from "lucide-react";
import { editarEntradaDiario, excluirEntradaDiario } from "@/modules/projetos/diario/actions";
import type { diarioDoProjeto } from "@/modules/projetos/diario/queries";
import { DiarioEntradaDialog } from "@/components/projetos/diario-entrada-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatarDataHora } from "@/lib/utils";

type Disciplinas = Awaited<ReturnType<typeof diarioDoProjeto>>;

function dataLabel(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function DiarioView({ disciplinas, projetoId }: { disciplinas: Disciplinas; projetoId: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Diário de projeto</h2>
        <p className="text-sm text-muted-foreground">
          Evolução diária dos trabalhos, registrada por disciplina pelos responsáveis.
        </p>
      </div>

      {disciplinas.length === 0 ? (
        <EmptyState icon={NotebookPen} title="Nenhuma disciplina neste projeto" />
      ) : (
        <div className="space-y-4">
          {disciplinas.map((d) => (
            <DisciplinaDiario key={d.disciplinaId} disciplina={d} projetoId={projetoId} />
          ))}
        </div>
      )}
    </div>
  );
}

function DisciplinaDiario({ disciplina, projetoId }: { disciplina: Disciplinas[number]; projetoId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [novaEntradaAberta, setNovaEntradaAberta] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");

  function iniciarEdicao(id: string, texto: string) {
    setEditandoId(id);
    setEditTexto(texto);
  }

  function salvarEdicao() {
    if (!editandoId || !editTexto.trim()) return;
    start(async () => {
      const r = await editarEntradaDiario({ id: editandoId, texto: editTexto.trim() });
      if (r.ok) {
        toast.success("Entrada atualizada.");
        setEditandoId(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function excluir(id: string) {
    const ok = await confirm({
      title: "Excluir entrada do diário?",
      description: "Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirEntradaDiario({ id });
      if (r.ok) {
        toast.success("Entrada excluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{disciplina.disciplinaNome}</CardTitle>
        {disciplina.podeEscrever && (
          <Button size="sm" variant="outline" onClick={() => setNovaEntradaAberta(true)}>
            <NotebookPen className="size-3.5" /> Registrar entrada
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {disciplina.podeEscrever && (
          <DiarioEntradaDialog
            open={novaEntradaAberta}
            onOpenChange={setNovaEntradaAberta}
            disciplinas={[{ id: disciplina.disciplinaId, nome: disciplina.disciplinaNome }]}
            projetoId={projetoId}
          />
        )}

        {disciplina.entradas.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">Nenhuma entrada registrada.</p>
        ) : (
          <ul className="space-y-2">
            {disciplina.entradas.map((e) => (
              <li key={e.id} className="rounded-sm border px-3 py-2 text-sm">
                {editandoId === e.id ? (
                  <div className="space-y-1.5">
                    <textarea
                      rows={2}
                      autoFocus
                      className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                      value={editTexto}
                      onChange={(ev) => setEditTexto(ev.target.value)}
                      maxLength={5000}
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setEditandoId(null)} disabled={pending}>
                        <X className="size-3.5" /> Cancelar
                      </Button>
                      <Button size="sm" onClick={salvarEdicao} disabled={pending || !editTexto.trim()}>
                        <Check className="size-3.5" /> Salvar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium capitalize text-muted-foreground">{dataLabel(e.data)}</span>
                      {e.podeGerir && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Editar entrada"
                            onClick={() => iniciarEdicao(e.id, e.texto)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Excluir entrada"
                            onClick={() => void excluir(e.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words">{e.texto}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {e.autorNome} · {formatarDataHora(e.criadoEm)}
                      {e.editado && " · editado"}
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
