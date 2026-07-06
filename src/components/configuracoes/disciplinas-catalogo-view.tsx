"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  Upload,
  Shapes,
  Search,
  MoreHorizontal,
  TriangleAlert,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  criarDisciplinaCatalogo,
  editarDisciplinaCatalogo,
  arquivarDisciplinaCatalogo,
  excluirDisciplinaCatalogo,
  moverDisciplinaCatalogo,
} from "@/modules/projetos/actions";
import type { DisciplinaCatalogoAdmin } from "@/modules/projetos/queries";
import { normalizar } from "@/lib/disciplinas-core";
import { iconeDisciplina } from "@/lib/disciplinas";
import { GALERIA_ICONES, CHAVES_GALERIA } from "@/lib/disciplinas-galeria";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
const TODAS = "__todas__";
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

  const [busca, setBusca] = useState("");
  const [filtroCat, setFiltroCat] = useState<string>(TODAS);
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);

  const categorias = useMemo(
    () => [...new Set(itens.map((i) => i.categoria).filter((c): c is string => !!c))].sort(),
    [itens],
  );

  // Filtro: arquivadas (toggle) → busca (nome/sigla/categoria) → categoria.
  const filtradas = useMemo(() => {
    const q = normalizar(busca);
    return itens.filter((i) => {
      if (!mostrarArquivadas && !i.ativo) return false;
      if (filtroCat !== TODAS && (i.categoria || SEM_CATEGORIA) !== filtroCat) return false;
      if (!q) return true;
      return (
        normalizar(i.nome).includes(q) ||
        normalizar(i.codigo ?? "").includes(q) ||
        normalizar(i.categoria ?? "").includes(q)
      );
    });
  }, [itens, busca, filtroCat, mostrarArquivadas]);

  // Agrupa por categoria; "Outras" por último.
  const grupos = useMemo(() => {
    const mapa = new Map<string, DisciplinaCatalogoAdmin[]>();
    for (const i of filtradas) {
      const k = i.categoria || SEM_CATEGORIA;
      (mapa.get(k) ?? mapa.set(k, []).get(k)!).push(i);
    }
    return [...mapa.entries()].sort(([a], [b]) =>
      a === SEM_CATEGORIA ? 1 : b === SEM_CATEGORIA ? -1 : a.localeCompare(b),
    );
  }, [filtradas]);

  const totalAtivas = itens.filter((i) => i.ativo).length;
  const totalArquivadas = itens.length - totalAtivas;

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

  function mover(item: DisciplinaCatalogoAdmin, vizinhoId: string) {
    start(async () => {
      const r = await moverDisciplinaCatalogo({ id: item.id, vizinhoId });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  async function excluir(item: DisciplinaCatalogoAdmin) {
    // Em uso → exclusão bloqueada; comunica no confirm e oferece arquivar (se ainda ativa).
    if (item.uso > 0) {
      const ok = await confirm({
        title: "Não é possível excluir",
        description: `“${item.nome}” está em uso em ${item.uso} projeto(s). Arquive em vez de excluir — some dos seletores sem apagar os projetos.`,
        confirmLabel: item.ativo ? "Arquivar" : "Entendi",
        cancelLabel: "Fechar",
      });
      if (ok && item.ativo) arquivar(item);
      return;
    }
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

      {/* Barra de ferramentas: busca · categoria · arquivadas */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-2.5 size-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, sigla ou categoria…"
            className="pl-8"
          />
        </div>
        <Select value={filtroCat} onValueChange={(v) => setFiltroCat(v ?? TODAS)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
            {itens.some((i) => !i.categoria) && <SelectItem value={SEM_CATEGORIA}>{SEM_CATEGORIA}</SelectItem>}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={mostrarArquivadas} onCheckedChange={setMostrarArquivadas} />
          Arquivadas ({totalArquivadas})
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtradas.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Shapes}
                title={busca || filtroCat !== TODAS ? "Nada encontrado" : "Nenhuma disciplina"}
                description={
                  busca || filtroCat !== TODAS
                    ? "Ajuste a busca ou o filtro de categoria."
                    : "Adicione a primeira disciplina do catálogo."
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9" />
                  <TableHead>Disciplina</TableHead>
                  <TableHead className="w-24">Código</TableHead>
                  <TableHead className="w-24">Uso</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map(([categoria, lista]) => (
                  <GrupoCategoria key={categoria} categoria={categoria} lista={lista}>
                    {lista.map((item, idx) => (
                      <ItemLinha
                        key={item.id}
                        item={item}
                        pending={pending}
                        podeReordenar={!busca}
                        vizinhoCimaId={idx > 0 ? lista[idx - 1].id : null}
                        vizinhoBaixoId={idx < lista.length - 1 ? lista[idx + 1].id : null}
                        onMover={(vizinhoId) => mover(item, vizinhoId)}
                        onEditar={() => setDialogo(paraForm(item))}
                        onArquivar={() => arquivar(item)}
                        onExcluir={() => excluir(item)}
                      />
                    ))}
                  </GrupoCategoria>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {totalAtivas} ativa(s){totalArquivadas > 0 && ` · ${totalArquivadas} arquivada(s)`}.
      </p>

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

/** Linha-cabeçalho da categoria + suas linhas. */
function GrupoCategoria({
  categoria,
  lista,
  children,
}: {
  categoria: string;
  lista: DisciplinaCatalogoAdmin[];
  children: React.ReactNode;
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={5} className="py-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{categoria}</span>
            <span className="text-xs text-muted-foreground">{lista.length}</span>
          </div>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}

function ItemLinha({
  item,
  pending,
  podeReordenar,
  vizinhoCimaId,
  vizinhoBaixoId,
  onMover,
  onEditar,
  onArquivar,
  onExcluir,
}: {
  item: DisciplinaCatalogoAdmin;
  pending: boolean;
  podeReordenar: boolean;
  vizinhoCimaId: string | null;
  vizinhoBaixoId: string | null;
  onMover: (vizinhoId: string) => void;
  onEditar: () => void;
  onArquivar: () => void;
  onExcluir: () => void;
}) {
  return (
    <TableRow className={cn(!item.ativo && "opacity-60")}>
      <TableCell>
        <IconeDisc icone={item.icone} iconeSvg={item.iconeSvg} nome={item.nome} className="size-5 text-muted-foreground" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className={cn("font-medium", !item.ativo && "line-through")}>{item.nome}</span>
          {!item.ativo && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              arquivada
            </Badge>
          )}
          {!item.codigo && (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
              title="Sem sigla — a nomenclatura de arquivos usará o nome inteiro."
            >
              <TriangleAlert className="size-3" /> sem sigla
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {item.codigo ? (
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            {item.codigo}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {item.uso > 0 ? (
          <Link
            href={`/projetos?disciplina=${encodeURIComponent(item.nome)}`}
            className="text-xs text-primary hover:underline"
            title={`Ver ${item.uso} projeto(s) que usam esta disciplina`}
          >
            {item.uso} proj.
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end">
          {podeReordenar && (
            <div className="mr-0.5 flex flex-col">
              <button
                type="button"
                aria-label="Mover para cima"
                disabled={pending || !vizinhoCimaId}
                onClick={() => vizinhoCimaId && onMover(vizinhoCimaId)}
                className="text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Mover para baixo"
                disabled={pending || !vizinhoBaixoId}
                onClick={() => vizinhoBaixoId && onMover(vizinhoBaixoId)}
                className="text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </div>
          )}
          <Button size="icon" variant="ghost" className="size-8" aria-label="Editar" onClick={onEditar} disabled={pending}>
            <Pencil className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon" variant="ghost" className="size-8" aria-label="Mais ações" disabled={pending}>
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onArquivar}>
                {item.ativo ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
                {item.ativo ? "Arquivar" : "Desarquivar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onExcluir}>
                <Trash2 className="size-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
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
