"use client";

import { useState, useTransition } from "react";
import { formatarDiaMes } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Flag, CheckCheck, ArrowLeft, ZoomIn, ZoomOut, Rocket } from "lucide-react";
import { definirLinhaBase, aplicarAoProjeto } from "@/modules/planejamento/actions";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Gantt, GANTT_PX_DEFAULT } from "@/components/planejamento/gantt";
import { EapDialog } from "@/components/planejamento/eap-dialog";

const fmt = (iso: string | null) =>
  iso ? formatarDiaMes(iso) : "—";

const diasDesvio = (t: EapTarefaDTO) => {
  if (!t.fimBaseline) return 0;
  const a = new Date(t.fimPrevisto + "T00:00:00").getTime();
  const b = new Date(t.fimBaseline + "T00:00:00").getTime();
  return Math.round((a - b) / 86400000);
};

export function EapWorkspace({
  projeto,
  tarefas,
  disciplinas,
  temLinhaBase,
  podeGerir,
}: {
  projeto: { id: string; codigo: string; nome: string };
  tarefas: EapTarefaDTO[];
  disciplinas: { id: string; nome: string }[];
  temLinhaBase: boolean;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [px, setPx] = useState(GANTT_PX_DEFAULT);
  const [dialog, setDialog] = useState<{ open: boolean; tarefa: EapTarefaDTO | null }>({
    open: false,
    tarefa: null,
  });

  const abrir = (tarefa: EapTarefaDTO | null) => {
    if (!podeGerir) return;
    setDialog({ open: true, tarefa });
  };
  const selecionar = (id: string) => abrir(tarefas.find((t) => t.id === id) ?? null);
  const vazio = tarefas.length === 0;

  function linhaBase() {
    start(async () => {
      const r = await definirLinhaBase({ projetoId: projeto.id });
      if (r.ok) {
        toast.success(temLinhaBase ? "Linha de base atualizada." : "Linha de base definida.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // Prévia do que "Aplicar ao projeto" vai gravar: por disciplina vinculada,
  // o prazo passa a ser o MAIOR fimPrevisto entre as tarefas dessa disciplina.
  function previaAplicacao() {
    const porDisciplina = new Map<string, { nome: string; prazo: string }>();
    for (const t of tarefas) {
      if (!t.disciplinaId) continue;
      const atual = porDisciplina.get(t.disciplinaId);
      if (!atual || t.fimPrevisto > atual.prazo) {
        porDisciplina.set(t.disciplinaId, {
          nome: t.disciplinaNome ?? "Disciplina",
          prazo: t.fimPrevisto,
        });
      }
    }
    return [...porDisciplina.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async function aplicar() {
    const previa = previaAplicacao();
    if (previa.length === 0) {
      toast.error("Nenhuma tarefa vinculada a disciplina. Vincule disciplinas para aplicar.");
      return;
    }
    const linhas = previa.map((d) => `${d.nome} → ${fmt(d.prazo)}`).join("; ");
    const ok = await confirm({
      title: `Aplicar prazos a ${previa.length} disciplina(s)?`,
      description: `Os prazos das disciplinas vinculadas serão sobrescritos pelo fim previsto da EAP: ${linhas}.`,
      confirmLabel: "Aplicar",
    });
    if (!ok) return;
    start(async () => {
      const r = await aplicarAoProjeto({ projetoId: projeto.id });
      if (r.ok) {
        toast.success("Prazos aplicados às disciplinas vinculadas.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/planejamento"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Planejamento
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">
            <span className="font-mono text-primary">{projeto.codigo}</span> · {projeto.nome}
          </h2>
          <p className="text-sm text-muted-foreground">
            EAP e cronograma. {temLinhaBase ? "Linha de base definida." : "Sem linha de base."}
          </p>
        </div>
        {podeGerir && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => abrir(null)}>
              <Plus className="size-3.5" /> Nova tarefa
            </Button>
            <Button size="sm" variant="outline" onClick={linhaBase} disabled={pending || tarefas.length === 0}>
              <Flag className="size-3.5" /> {temLinhaBase ? "Atualizar linha de base" : "Definir linha de base"}
            </Button>
            <Button size="sm" variant="outline" onClick={aplicar} disabled={pending || tarefas.length === 0}>
              <CheckCheck className="size-3.5" /> Aplicar ao projeto
            </Button>
          </div>
        )}
      </div>

      {vazio ? (
        <div className="rounded-sm border border-dashed">
          <EmptyState
            icon={Rocket}
            title="Este projeto ainda não tem planejamento"
            description={
              podeGerir
                ? "Comece criando a primeira tarefa da EAP para montar o cronograma."
                : "Nenhuma tarefa foi cadastrada ainda."
            }
            action={
              podeGerir ? (
                <Button onClick={() => abrir(null)}>
                  <Rocket className="size-3.5" /> Iniciar planejamento
                </Button>
              ) : undefined
            }
            className="py-14"
          />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-end gap-1">
            <span className="mr-1 text-xs text-muted-foreground">Zoom</span>
            <Button size="icon-sm" variant="outline" aria-label="Diminuir zoom" onClick={() => setPx((p) => Math.max(6, p - 4))} disabled={px <= 6}>
              <ZoomOut className="size-3.5" />
            </Button>
            <Button size="icon-sm" variant="outline" aria-label="Aumentar zoom" onClick={() => setPx((p) => Math.min(48, p + 4))} disabled={px >= 48}>
              <ZoomIn className="size-3.5" />
            </Button>
          </div>
          <Gantt tarefas={tarefas} onSelecionar={podeGerir ? selecionar : undefined} px={px} />

          {/* Lista / EAP */}
          <div className="overflow-x-auto rounded-sm border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Tarefa</th>
                  <th className="px-3 py-2">Disciplina</th>
                  <th className="px-3 py-2">Previsto</th>
                  <th className="px-3 py-2">Linha de base</th>
                  <th className="px-3 py-2">Progresso</th>
                  <th className="px-3 py-2 text-right">Desvio</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tarefas.map((t) => {
                  const desvio = diasDesvio(t);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => abrir(t)}
                      className={podeGerir ? "cursor-pointer hover:bg-muted/40" : ""}
                    >
                      <td className="px-3 py-2" style={{ paddingLeft: t.parentId ? 28 : 12 }}>
                        <span className={t.parentId ? "text-muted-foreground" : "font-medium"}>{t.nome}</span>
                        {t.predecessoraIds.length > 0 && (
                          <span className="ml-1 text-[10px] text-warning">↳{t.predecessoraIds.length}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{t.disciplinaNome ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                        {fmt(t.inicioPrevisto)} – {fmt(t.fimPrevisto)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                        {t.inicioBaseline ? `${fmt(t.inicioBaseline)} – ${fmt(t.fimBaseline)}` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-sm bg-muted">
                            <div className="h-full bg-primary" style={{ width: `${t.progresso}%` }} />
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">{t.progresso}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {t.fimBaseline == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : desvio > 0 ? (
                          <Badge variant="outline" className="border-destructive/40 text-destructive">
                            +{desvio}d
                          </Badge>
                        ) : desvio < 0 ? (
                          <Badge variant="outline" className="border-success/40 text-success">
                            {desvio}d
                          </Badge>
                        ) : (
                          <Badge variant="outline">no prazo</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {podeGerir && (
        <EapDialog
          tarefa={dialog.tarefa}
          open={dialog.open}
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          projetoId={projeto.id}
          disciplinas={disciplinas}
          tarefas={tarefas}
        />
      )}
    </div>
  );
}
