"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Archive, ArchiveRestore, Trash2, Upload, Shapes } from "lucide-react";
import {
  criarDisciplinaCatalogo,
  editarDisciplinaCatalogo,
  arquivarDisciplinaCatalogo,
  excluirDisciplinaCatalogo,
} from "@/modules/projetos/actions";
import type { DisciplinaCatalogoAdmin } from "@/modules/projetos/queries";
import { iconeDisciplina } from "@/lib/disciplinas";
import { GALERIA_ICONES, CHAVES_GALERIA } from "@/lib/disciplinas-galeria";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SEM_CATEGORIA = "Outras";
const SVG_MAX = 20 * 1024;

type FormState = {
  id?: string;
  nome: string;
  codigo: string;
  categoria: string;
  icone: string | null;
  iconeSvg: string | null;
};

const VAZIO: FormState = { nome: "", codigo: "", categoria: "", icone: null, iconeSvg: null };

/** Ícone de um item do catálogo, resolvido pelos próprios campos (svg → galeria → derivado). */
function IconeDisc({
  icone,
  iconeSvg,
  nome,
  className = "size-4",
}: {
  icone: string | null;
  iconeSvg: string | null;
  nome: string;
  className?: string;
}) {
  if (iconeSvg) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`data:image/svg+xml;utf8,${encodeURIComponent(iconeSvg)}`} alt="" aria-hidden className={className} />;
  }
  const Icone = (icone ? GALERIA_ICONES[icone] : undefined) ?? iconeDisciplina(nome);
  return <Icone className={className} aria-hidden />;
}

export function DisciplinasCatalogoView({ itens }: { itens: DisciplinaCatalogoAdmin[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [dialogo, setDialogo] = useState<FormState | null>(null);

  const ativas = itens.filter((i) => i.ativo);
  const arquivadas = itens.filter((i) => !i.ativo);

  // Categorias existentes (para o datalist do form).
  const categorias = useMemo(
    () => [...new Set(itens.map((i) => i.categoria).filter((c): c is string => !!c))].sort(),
    [itens],
  );

  // Agrupa ativas por categoria; "Outras" por último.
  const grupos = useMemo(() => {
    const mapa = new Map<string, DisciplinaCatalogoAdmin[]>();
    for (const i of ativas) {
      const k = i.categoria || SEM_CATEGORIA;
      (mapa.get(k) ?? mapa.set(k, []).get(k)!).push(i);
    }
    return [...mapa.entries()].sort(([a], [b]) =>
      a === SEM_CATEGORIA ? 1 : b === SEM_CATEGORIA ? -1 : a.localeCompare(b),
    );
  }, [ativas]);

  function salvar(form: FormState) {
    if (!form.nome.trim()) return;
    start(async () => {
      const payload = {
        nome: form.nome.trim(),
        codigo: form.codigo.trim() || undefined,
        categoria: form.categoria.trim() || undefined,
        icone: form.icone || undefined,
        iconeSvg: form.iconeSvg || undefined,
      };
      const r = form.id
        ? await editarDisciplinaCatalogo({ id: form.id, ...payload })
        : await criarDisciplinaCatalogo(payload);
      if (r.ok) {
        toast.success(form.id ? "Disciplina atualizada." : "Disciplina criada.");
        setDialogo(null);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function arquivar(item: DisciplinaCatalogoAdmin) {
    start(async () => {
      const r = await arquivarDisciplinaCatalogo({ id: item.id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  async function excluir(item: DisciplinaCatalogoAdmin) {
    const ok = await confirm({
      title: `Excluir “${item.nome}”?`,
      description: "A disciplina será removida em definitivo do catálogo. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirDisciplinaCatalogo({ id: item.id });
      if (r.ok) {
        toast.success("Disciplina excluída.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/configuracoes"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Configurações
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">Catálogo de Disciplinas</h2>
          <p className="text-sm text-muted-foreground">
            Nomes canônicos usados em projetos e propostas. O código é usado na nomenclatura de arquivos.
          </p>
        </div>
        <Button onClick={() => setDialogo(VAZIO)} disabled={pending}>
          <Plus className="size-4" /> Adicionar nova disciplina
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ativas, agrupadas por categoria */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-tight text-foreground/80">
              Ativas ({ativas.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ativas.length === 0 ? (
              <EmptyState icon={Shapes} title="Nenhuma disciplina ativa" description="Adicione a primeira disciplina." />
            ) : (
              <div className="space-y-4">
                {grupos.map(([categoria, lista]) => (
                  <div key={categoria}>
                    <div className="mb-1 flex items-center justify-between border-b pb-1">
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {categoria}
                      </span>
                      <span className="text-xs text-muted-foreground">{lista.length}</span>
                    </div>
                    <ul className="divide-y">
                      {lista.map((item) => (
                        <ItemLinha
                          key={item.id}
                          item={item}
                          pending={pending}
                          onEditar={() => setDialogo(paraForm(item))}
                          onArquivar={() => arquivar(item)}
                          onExcluir={() => excluir(item)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Arquivadas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-tight text-foreground/80">
              Arquivadas ({arquivadas.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {arquivadas.length === 0 ? (
              <EmptyState icon={Archive} title="Nenhuma disciplina arquivada" description="Disciplinas arquivadas somem dos seletores, mas não apagam projetos." />
            ) : (
              <ul className="divide-y">
                {arquivadas.map((item) => (
                  <ItemLinha
                    key={item.id}
                    item={item}
                    arquivada
                    pending={pending}
                    onEditar={() => setDialogo(paraForm(item))}
                    onArquivar={() => arquivar(item)}
                    onExcluir={() => excluir(item)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {dialogo && (
        <DisciplinaDialog
          inicial={dialogo}
          categorias={categorias}
          pending={pending}
          onSalvar={salvar}
          onFechar={() => setDialogo(null)}
        />
      )}
    </div>
  );
}

function paraForm(item: DisciplinaCatalogoAdmin): FormState {
  return {
    id: item.id,
    nome: item.nome,
    codigo: item.codigo ?? "",
    categoria: item.categoria ?? "",
    icone: item.icone,
    iconeSvg: item.iconeSvg,
  };
}

function ItemLinha({
  item,
  arquivada,
  pending,
  onEditar,
  onArquivar,
  onExcluir,
}: {
  item: DisciplinaCatalogoAdmin;
  arquivada?: boolean;
  pending: boolean;
  onEditar: () => void;
  onArquivar: () => void;
  onExcluir: () => void;
}) {
  const emUso = item.uso > 0;
  return (
    <li className="flex items-center gap-2 py-2">
      <IconeDisc icone={item.icone} iconeSvg={item.iconeSvg} nome={item.nome} className="size-4 shrink-0 text-muted-foreground" />
      {item.codigo && (
        <Badge variant="outline" className="font-mono text-[10px] uppercase">
          {item.codigo}
        </Badge>
      )}
      <span className={cn("flex-1 truncate text-sm font-medium", arquivada && "text-muted-foreground line-through")}>
        {item.nome}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground" title={`Em uso em ${item.uso} projeto(s)`}>
        {emUso ? `${item.uso}p` : "—"}
      </span>
      <div className="flex shrink-0 items-center">
        <Button size="icon" variant="ghost" className="size-8" aria-label="Editar" onClick={onEditar} disabled={pending}>
          <Pencil className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={arquivada ? "Desarquivar" : "Arquivar"}
          onClick={onArquivar}
          disabled={pending}
        >
          {arquivada ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        </Button>
        {emUso ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label="Excluir" disabled>
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              }
            />
            <TooltipContent>Em uso — arquive em vez de excluir.</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-destructive hover:text-destructive"
            aria-label="Excluir"
            onClick={onExcluir}
            disabled={pending}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

function DisciplinaDialog({
  inicial,
  categorias,
  pending,
  onSalvar,
  onFechar,
}: {
  inicial: FormState;
  categorias: string[];
  pending: boolean;
  onSalvar: (f: FormState) => void;
  onFechar: () => void;
}) {
  const [form, setForm] = useState<FormState>(inicial);

  async function onArquivoSvg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo
    if (!file) return;
    if (file.size > SVG_MAX) {
      toast.error("SVG acima de 20 KB.");
      return;
    }
    const txt = await file.text();
    if (!txt.includes("<svg")) {
      toast.error("Arquivo não parece um SVG.");
      return;
    }
    setForm((f) => ({ ...f, iconeSvg: txt, icone: null }));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar disciplina" : "Nova disciplina"}</DialogTitle>
          <DialogDescription>Nome, sigla, categoria e ícone.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input
                value={form.codigo}
                maxLength={6}
                placeholder="ELE"
                className="font-mono uppercase"
                onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Input
              list="cats-disc"
              value={form.categoria}
              placeholder="CIVIL, ELÉTRICA…"
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
            />
            <datalist id="cats-disc">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label>Ícone</Label>
            <Tabs defaultValue="galeria">
              <TabsList>
                <TabsTrigger value="galeria">Galeria</TabsTrigger>
                <TabsTrigger value="svg">Enviar SVG</TabsTrigger>
              </TabsList>

              <TabsContent value="galeria" className="pt-2">
                <div className="grid max-h-52 grid-cols-8 gap-1 overflow-y-auto rounded-md border p-2">
                  {CHAVES_GALERIA.map((chave) => {
                    const Icone = GALERIA_ICONES[chave];
                    const sel = form.icone === chave && !form.iconeSvg;
                    return (
                      <button
                        key={chave}
                        type="button"
                        title={chave}
                        onClick={() => setForm((f) => ({ ...f, icone: chave, iconeSvg: null }))}
                        className={cn(
                          "grid aspect-square place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-muted",
                          sel ? "border-primary bg-primary/10 text-primary" : "border-transparent",
                        )}
                      >
                        <Icone className="size-5" />
                      </button>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="svg" className="pt-2">
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-md border bg-muted/40">
                    <IconeDisc icone={form.icone} iconeSvg={form.iconeSvg} nome={form.nome} className="size-7 text-foreground" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-sm hover:bg-muted">
                      <Upload className="size-4" /> Escolher .svg
                      <input type="file" accept=".svg,image/svg+xml" className="hidden" onChange={onArquivoSvg} />
                    </label>
                    <p className="text-xs text-muted-foreground">SVG até 20 KB. Sanitizado no envio.</p>
                    {form.iconeSvg && (
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline"
                        onClick={() => setForm((f) => ({ ...f, iconeSvg: null }))}
                      >
                        Remover SVG
                      </button>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            {!form.icone && !form.iconeSvg && (
              <p className="text-xs text-muted-foreground">
                Sem ícone escolhido → o sistema deriva um ícone pelo nome.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => onSalvar(form)} disabled={pending || !form.nome.trim()}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
