"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, X, Check, NotebookPen, Compass } from "lucide-react";
import { criarEntradaCoordenacao, editarEntradaDiario, excluirEntradaDiario } from "@/modules/projetos/diario/actions";
import type { DiarioCoordenacao, EntradaCoordenacao, diarioDoProjeto } from "@/modules/projetos/diario/queries";
import { DiarioEntradaDialog } from "@/components/projetos/diario-entrada-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatarDataHora } from "@/lib/utils";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";

type Disciplinas = Awaited<ReturnType<typeof diarioDoProjeto>>;

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataLabel(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function DiarioView({
  disciplinas,
  coordenacao,
  projetoId,
}: {
  disciplinas: Disciplinas;
  coordenacao: DiarioCoordenacao;
  projetoId: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Diário de projeto</h2>
        <p className="text-sm text-muted-foreground">
          Decisões e análises da coordenação e evolução diária dos trabalhos de cada disciplina.
        </p>
      </div>

      <CoordenacaoDiario coordenacao={coordenacao} projetoId={projetoId} />

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

function CoordenacaoDiario({ coordenacao, projetoId }: { coordenacao: DiarioCoordenacao; projetoId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [data, setData] = useState(hojeISO());

  function abrir() {
    setTexto("");
    setData(hojeISO());
    setAberto(true);
  }

  function registrar() {
    if (!texto.trim()) return;
    start(async () => {
      const r = await criarEntradaCoordenacao({ projetoId, data, texto: texto.trim() });
      if (r.ok) {
        toast.success("Entrada registrada.");
        setAberto(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-1.5 text-base">
            <Compass className="size-4 shrink-0 text-primary" /> Coordenação
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Decisões e análises que valem para o projeto inteiro.</p>
        </div>
        {coordenacao.podeEscrever && !aberto && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={abrir}>
            <NotebookPen className="size-3.5" /> Registrar entrada
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {aberto && (
          <div className="space-y-2 rounded-sm border bg-muted/20 p-2.5">
            <textarea
              rows={3}
              autoFocus
              aria-label="Decisão ou análise da coordenação"
              placeholder="Descreva a decisão ou análise…"
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={5000}
              disabled={pending}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Input
                type="date"
                aria-label="Data da entrada"
                value={data}
                max={hojeISO()}
                onChange={(e) => setData(e.target.value)}
                disabled={pending}
                className="w-auto"
              />
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setAberto(false)} disabled={pending}>
                  <X className="size-3.5" /> Cancelar
                </Button>
                <Button size="sm" onClick={registrar} disabled={pending || !texto.trim() || !data}>
                  <Check className="size-3.5" /> Registrar
                </Button>
              </div>
            </div>
          </div>
        )}
        <ListaEntradas entradas={coordenacao.entradas} />
      </CardContent>
    </Card>
  );
}

function DisciplinaDiario({ disciplina, projetoId }: { disciplina: Disciplinas[number]; projetoId: string }) {
  const [novaEntradaAberta, setNovaEntradaAberta] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="min-w-0 text-base">{disciplina.disciplinaNome}</CardTitle>
        {disciplina.podeEscrever && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setNovaEntradaAberta(true)}>
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
        <ListaEntradas entradas={disciplina.entradas} />
      </CardContent>
    </Card>
  );
}

/** Lista de entradas com edição inline e exclusão — igual nos cards das disciplinas e da coordenação. */
function ListaEntradas({ entradas }: { entradas: EntradaCoordenacao[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
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

  if (entradas.length === 0) {
    return <p className="py-2 text-center text-xs text-muted-foreground">Nenhuma entrada registrada.</p>;
  }

  return (
    <ul className="space-y-2">
      {entradas.map((e) => (
        <li key={e.id} className="rounded-sm border px-3 py-2 text-sm">
          {editandoId === e.id ? (
            <div className="space-y-1.5">
              <textarea
                rows={2}
                autoFocus
                aria-label="Texto da entrada"
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={editTexto}
                onChange={(ev) => setEditTexto(ev.target.value)}
                maxLength={5000}
              />
              <div className="flex flex-wrap justify-end gap-1.5">
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
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="text-muted-foreground"
                      aria-label="Editar entrada"
                      onClick={() => iniciarEdicao(e.id, e.texto)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Excluir entrada"
                      onClick={() => void excluir(e.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{e.texto}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <AvatarUsuario nome={e.autorNome} image={e.autorImage} size="sm" className="size-4" title={e.autorNome} />
                {e.autorNome} · {formatarDataHora(e.criadoEm)}
                {e.editado && " · editado"}
              </p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
