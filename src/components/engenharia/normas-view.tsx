"use client";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Download, Eye, Pencil, Trash2, BookMarked, FolderOpen, Library } from "lucide-react";
import { criarNorma, editarNorma, excluirNorma } from "@/modules/engenharia/actions";
import type { NormaItem } from "@/modules/engenharia/queries";
import { buscarNormas, montarPastas, normasDaPasta, PASTA_GERAL, type PastaNormas } from "@/modules/engenharia/pastas-normas";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { VisualizarDocumentoDialog } from "@/components/certidoes/visualizar-documento-dialog";
import { useSetParams } from "@/lib/use-set-param";
import { cn, formatarData } from "@/lib/utils";

/** Corpo da rota de upload: metadata em caso de sucesso, `error` em caso de falha. */
type RespostaUpload = {
  caminho: string;
  nomeArquivo: string;
  mime?: string | null;
  tamanho: number;
  hashSha256?: string | null;
  error?: string;
};

type DisciplinaCatalogo = { id: string; nome: string; categoria: string | null };

/** Valor do seletor de pasta no celular para "todas" (o Select não aceita valor vazio). */
const TODAS = "__todas";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function plural(n: number) {
  return `${n} ${n === 1 ? "norma" : "normas"}`;
}

export function NormasView({
  normas,
  disciplinas,
  podeIncluir,
  podeGerir,
  usuarioId,
}: {
  normas: NormaItem[];
  disciplinas: DisciplinaCatalogo[];
  podeIncluir: boolean;
  podeGerir: boolean;
  usuarioId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const setParams = useSetParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [dialogo, setDialogo] = useState<{ modo: "nova" } | { modo: "editar"; norma: NormaItem } | null>(null);
  const [visualizando, setVisualizando] = useState<NormaItem | null>(null);

  // A pasta vive na URL (`?pasta=`): voltar no navegador volta de pasta, e o link pode ser mandado.
  const pasta = useSearchParams().get("pasta");
  const pastas = useMemo(() => montarPastas(normas), [normas]);
  const pastaAtual = pastas.find((p) => p.id === pasta) ?? null;
  const nomePasta = pasta ? (pastaAtual?.nome ?? "Pasta vazia") : "Todas as normas";

  const daPasta = useMemo(() => normasDaPasta(normas, pasta), [normas, pasta]);
  const filtradas = useMemo(() => buscarNormas(daPasta, q), [daPasta, q]);
  const termo = q.trim();
  // A busca vale na pasta aberta; achando só fora dela, a tela diz quantas e oferece ver todas.
  const emOutrasPastas = useMemo(
    () => (termo && pasta && filtradas.length === 0 ? buscarNormas(normas, termo).length : 0),
    [termo, pasta, filtradas.length, normas],
  );

  function abrirPasta(id: string | null) {
    setParams({ pasta: id });
  }

  async function excluir(id: string, numero: string) {
    const ok = await confirm({
      title: "Excluir norma",
      description: `Remover "${numero}" do catálogo? O PDF também é apagado.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirNorma({ id });
      if (r.ok) {
        toast.success("Norma excluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // Incluir de dentro de uma pasta de disciplina já marca essa disciplina.
  const disciplinaDaPasta = pastaAtual?.tipo === "disciplina" ? [pastaAtual.id] : [];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Normas Técnicas"
        descricao="Normas em PDF, em pastas por disciplina."
        acoes={
          podeIncluir ? (
            <Button size="sm" onClick={() => setDialogo({ modo: "nova" })}>
              <Plus className="size-3.5" /> Incluir norma
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <aside className="hidden self-start rounded-md border border-border bg-card md:block">
          <div className="border-b border-border px-3 py-2.5">
            <h2 className="text-sm font-semibold">Pastas</h2>
          </div>
          <ListaPastas pastas={pastas} total={normas.length} selecionada={pasta} onAbrir={abrirPasta} />
        </aside>

        <main className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Celular: a coluna de pastas não cabe ao lado da tabela, vira um seletor. */}
            <div className="w-full md:hidden">
              <Select value={pasta ?? TODAS} onValueChange={(v) => abrirPasta(!v || v === TODAS ? null : v)}>
                <SelectTrigger className="w-full" aria-label="Pasta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas as normas ({normas.length})</SelectItem>
                  {pastas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} ({p.total})
                    </SelectItem>
                  ))}
                  {pasta && !pastaAtual && <SelectItem value={pasta}>Pasta vazia</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <p className="mr-auto hidden text-sm font-medium md:block">
              {nomePasta}
              <span className="ml-2 font-normal tabular-nums text-muted-foreground">{plural(daPasta.length)}</span>
            </p>

            <div className="relative w-full md:max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={pasta ? `Buscar em ${nomePasta}…` : "Buscar por número, título, ano ou disciplina…"}
                aria-label="Buscar norma"
                className="pl-8"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {filtradas.length === 0 ? (
                <EmptyState
                  icon={BookMarked}
                  title={termo ? "Nenhuma norma encontrada" : pasta ? "Nenhuma norma nesta pasta" : "Nenhuma norma catalogada"}
                  description={
                    emOutrasPastas > 0
                      ? `${plural(emOutrasPastas)} com esse termo em outras pastas.`
                      : termo
                        ? "Ajuste a busca."
                        : pasta
                          ? "As pastas mostram só as disciplinas que têm norma."
                          : "Catalogue a primeira norma técnica."
                  }
                  action={
                    pasta && (emOutrasPastas > 0 || !termo) ? (
                      <Button variant="outline" size="sm" onClick={() => abrirPasta(null)}>
                        {emOutrasPastas > 0 ? "Buscar em todas as pastas" : "Ver todas as normas"}
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  {/* Celular: cartões — na tabela o título quebrava palavra a palavra e as ações
                      saíam da tela. */}
                  <ul className="divide-y md:hidden">
                    {filtradas.map((n) => (
                      <li key={n.id} className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold">
                          {n.numero}
                          <span className="ml-1.5 font-normal text-muted-foreground">· {n.ano}</span>
                        </p>
                        <p className="text-sm">{n.titulo}</p>
                        <PastasDaNorma norma={n} pastaAberta={pasta} onAbrir={abrirPasta} />
                        <div className="mt-1 flex justify-end">
                          <AcoesNorma
                            norma={n}
                            podeMexer={podeGerir || n.autorId === usuarioId}
                            pending={pending}
                            onVisualizar={() => setVisualizando(n)}
                            onEditar={() => setDialogo({ modo: "editar", norma: n })}
                            onExcluir={() => excluir(n.id, n.numero)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-sm">
                      <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2">Número</th>
                          <th className="px-4 py-2">Título</th>
                          <th className="px-4 py-2 text-right">Ano</th>
                          <th className="hidden px-4 py-2 lg:table-cell">Arquivo</th>
                          <th className="px-4 py-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filtradas.map((n) => (
                          <tr key={n.id} className="hover:bg-muted/40">
                            <td className="px-4 py-2 align-top font-mono text-xs font-semibold whitespace-nowrap">{n.numero}</td>
                            <td className="px-4 py-2 align-top">
                              <div>{n.titulo}</div>
                              <PastasDaNorma norma={n} pastaAberta={pasta} onAbrir={abrirPasta} />
                            </td>
                            <td className="px-4 py-2 text-right align-top font-mono text-xs">{n.ano}</td>
                            <td className="hidden px-4 py-2 align-top text-xs text-muted-foreground lg:table-cell">
                              {n.autor} · {formatarData(n.data)} · {fmtBytes(n.tamanho)}
                            </td>
                            <td className="px-4 py-2 text-right align-top whitespace-nowrap">
                              <AcoesNorma
                                norma={n}
                                podeMexer={podeGerir || n.autorId === usuarioId}
                                pending={pending}
                                onVisualizar={() => setVisualizando(n)}
                                onEditar={() => setDialogo({ modo: "editar", norma: n })}
                                onExcluir={() => excluir(n.id, n.numero)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Abre no visualizador do SenaHub, não numa aba do navegador: quem quiser o PDF fora
          do sistema usa Baixar. `inline` registra a abertura como visualização. */}
      <VisualizarDocumentoDialog
        url={visualizando ? `${visualizando.downloadUrl}?disposition=inline` : null}
        titulo={visualizando ? `${visualizando.numero} — ${visualizando.titulo}` : ""}
        onClose={() => setVisualizando(null)}
      />

      {dialogo && (
        <NormaDialog
          key={dialogo.modo === "editar" ? dialogo.norma.id : "nova"}
          norma={dialogo.modo === "editar" ? dialogo.norma : null}
          disciplinasIniciais={dialogo.modo === "editar" ? dialogo.norma.disciplinas.map((d) => d.id) : disciplinaDaPasta}
          catalogo={disciplinas}
          onFechar={() => setDialogo(null)}
        />
      )}
    </div>
  );
}

/**
 * Abrir, baixar, editar e excluir. Editar e excluir seguem a mesma regra do servidor: autor, ou
 * quem tem `gerir`.
 */
function AcoesNorma({
  norma: n,
  podeMexer,
  pending,
  onVisualizar,
  onEditar,
  onExcluir,
}: {
  norma: NormaItem;
  podeMexer: boolean;
  pending: boolean;
  onVisualizar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Visualizar ${n.numero}`}
        title="Visualizar"
        onClick={onVisualizar}
      >
        <Eye className="size-3.5" />
      </Button>
      <Button size="icon" variant="ghost" aria-label={`Baixar ${n.numero}`} render={<a href={n.downloadUrl} />}>
        <Download className="size-3.5" />
      </Button>
      {podeMexer && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Editar ${n.numero}`}
          title="Editar número, título, ano e pastas"
          onClick={onEditar}
        >
          <Pencil className="size-3.5" />
        </Button>
      )}
      {podeMexer && (
        <Button size="icon" variant="ghost" aria-label={`Excluir ${n.numero}`} disabled={pending} onClick={onExcluir}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </>
  );
}

/** Coluna de pastas (telas médias pra cima): "Todas", uma por disciplina com norma, e "Geral". */
function ListaPastas({
  pastas,
  total,
  selecionada,
  onAbrir,
}: {
  pastas: PastaNormas[];
  total: number;
  selecionada: string | null;
  onAbrir: (id: string | null) => void;
}) {
  return (
    <ul className="space-y-0.5 p-2" aria-label="Pastas por disciplina">
      <li>
        <ItemPasta
          rotulo="Todas as normas"
          total={total}
          selecionada={!selecionada}
          icone={<Library className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
          onClick={() => onAbrir(null)}
        />
      </li>
      {pastas.map((p) => (
        <li key={p.id}>
          <ItemPasta
            rotulo={p.nome}
            total={p.total}
            selecionada={selecionada === p.id}
            icone={
              p.tipo === "disciplina" ? (
                <DisciplinaIcone nome={p.nome} className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              )
            }
            titulo={p.tipo === "geral" ? "Normas sem disciplina" : undefined}
            onClick={() => onAbrir(p.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function ItemPasta({
  rotulo,
  total,
  selecionada,
  icone,
  titulo,
  onClick,
}: {
  rotulo: string;
  total: number;
  selecionada: boolean;
  icone: React.ReactNode;
  titulo?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-current={selecionada ? "true" : undefined}
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        selecionada ? "bg-accent font-semibold text-foreground" : "text-foreground hover:bg-accent/60",
      )}
    >
      {icone}
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
      <span className="shrink-0 font-normal tabular-nums text-muted-foreground">{total}</span>
    </button>
  );
}

/**
 * Pastas da norma, abaixo do título. Dentro de uma pasta, mostra só as OUTRAS — a atual é óbvia,
 * e "também em Arquitetura" é o que a pessoa não sabe. Cada uma leva para a respectiva pasta.
 */
function PastasDaNorma({
  norma,
  pastaAberta,
  onAbrir,
}: {
  norma: NormaItem;
  pastaAberta: string | null;
  onAbrir: (id: string) => void;
}) {
  const outras = norma.disciplinas.filter((d) => d.id !== pastaAberta);
  if (outras.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
      {pastaAberta && pastaAberta !== PASTA_GERAL && <span>Também em</span>}
      {outras.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onAbrir(d.id)}
          className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
        >
          <DisciplinaIcone nome={d.nome} className="size-3" />
          {d.nome}
        </button>
      ))}
    </div>
  );
}

/** Incluir (com o PDF) ou editar (metadados e pastas) uma norma. */
function NormaDialog({
  norma,
  disciplinasIniciais,
  catalogo,
  onFechar,
}: {
  norma: NormaItem | null;
  disciplinasIniciais: string[];
  catalogo: DisciplinaCatalogo[];
  onFechar: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    numero: norma?.numero ?? "",
    titulo: norma?.titulo ?? "",
    ano: String(norma?.ano ?? new Date().getFullYear()),
  });
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(disciplinasIniciais));

  // Disciplina já na norma e depois desativada no catálogo continua listada, para poder sair.
  const opcoes = useMemo(() => {
    const ids = new Set(catalogo.map((d) => d.id));
    const extras = (norma?.disciplinas ?? [])
      .filter((d) => !ids.has(d.id))
      .map((d) => ({ id: d.id, nome: d.nome, categoria: null }));
    return [...catalogo, ...extras];
  }, [catalogo, norma]);

  // Agrupa pela categoria do catálogo (CIVIL, ELÉTRICA…), mantendo a ordem em que chegam.
  const grupos = useMemo(() => {
    const m = new Map<string, DisciplinaCatalogo[]>();
    for (const d of opcoes) {
      const chave = d.categoria ?? "Outras";
      m.set(chave, [...(m.get(chave) ?? []), d]);
    }
    return [...m.entries()];
  }, [opcoes]);

  function alternar(id: string) {
    setMarcadas((atual) => {
      const prox = new Set(atual);
      if (prox.has(id)) prox.delete(id);
      else prox.add(id);
      return prox;
    });
  }

  async function salvar() {
    if (!form.numero.trim() || !form.titulo.trim()) return toast.error("Número e título são obrigatórios.");
    const campos = { numero: form.numero, titulo: form.titulo, ano: Number(form.ano), disciplinaIds: [...marcadas] };
    setBusy(true);
    try {
      if (norma) {
        const r = await editarNorma({ id: norma.id, ...campos });
        if (!r.ok) return toast.error(r.error);
        toast.success("Norma atualizada.");
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) return toast.error("Selecione o PDF da norma.");
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/engenharia/normas", { method: "POST", body: fd });
        // Resposta de erro pode vir sem corpo JSON (500 do runtime, página da CDN);
        // ler antes de checar o status esconderia a causa atrás de um erro de parse.
        const meta = (await res.json().catch(() => null)) as RespostaUpload | null;
        if (!res.ok || !meta?.caminho) {
          throw new Error(meta?.error ?? `Falha no upload (HTTP ${res.status}).`);
        }
        const r = await criarNorma({ ...campos, meta });
        if (!r.ok) return toast.error(r.error);
        toast.success("Norma catalogada.");
      }
      onFechar();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{norma ? `Editar ${norma.numero}` : "Incluir norma técnica"}</DialogTitle>
          {norma && <DialogDescription>Para trocar o PDF, exclua e inclua a norma de novo.</DialogDescription>}
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="norma-numero">Número</Label>
              <Input id="norma-numero" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="Ex.: NBR 6118" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="norma-ano">Ano da versão</Label>
              <Input id="norma-ano" type="number" min="1900" max="2100" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="norma-titulo">Título</Label>
            <Input id="norma-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Projeto de estruturas de concreto" />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Pastas (disciplinas)</legend>
            <p className="text-xs text-muted-foreground">
              Marque todas as que se aplicam. Sem nenhuma, a norma fica em <strong>Geral</strong>.
            </p>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border p-2">
              {grupos.map(([categoria, itens]) => (
                <div key={categoria}>
                  <p className="px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{categoria}</p>
                  <div className="grid gap-x-3 sm:grid-cols-2">
                    {itens.map((d) => (
                      <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent/60">
                        <Checkbox checked={marcadas.has(d.id)} onCheckedChange={() => alternar(d.id)} />
                        <DisciplinaIcone nome={d.nome} className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{d.nome}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          {!norma && (
            <div className="space-y-1.5">
              <Label htmlFor="norma-arquivo">Arquivo (PDF)</Label>
              <Input id="norma-arquivo" ref={fileRef} type="file" accept="application/pdf,.pdf" />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={busy}>
            {busy ? (norma ? "Salvando…" : "Enviando…") : norma ? "Salvar" : "Incluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
