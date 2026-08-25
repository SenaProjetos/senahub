"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Trash2, Archive, Paperclip, Send, FileText, X, Box, Link2, UsersRound } from "lucide-react";
import { formatarCodigo } from "@/modules/projetos/numbering";
import {
  criarTarefa,
  editarTarefa,
  arquivarTarefa,
  toggleItemTarefa,
  comentarTarefa,
  removerComentario,
} from "@/modules/tarefas/actions";
import { PRIORIDADES, PRIORIDADE_LABEL, type Prioridade } from "@/modules/tarefas/prioridade";
import { GLOBAL_ROLES } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type TarefaUI = {
  id: string;
  titulo: string;
  descricao: string;
  statusId: string;
  prazo: string;
  prioridade: string;
  projetoId: string;
  projetoCodigo: string | null;
  projetoNome: string | null;
  disciplinaId: string;
  criadorId: string;
  responsaveis: { id: string; nome: string }[];
  itens: { id?: string; descricao: string; concluido: boolean; apontamentoHref?: string }[];
  dependeDeIds: string[];
  bloqueada: boolean;
  comentarios?: { id: string; autorId: string; texto: string; autor: string; data: string; anexoMime: string | null; anexoNome: string | null }[];
};

export type OpcoesUI = {
  internos: { id: string; name: string }[];
  projetos: { id: string; codigo: string; nome: string }[];
  tarefas: { id: string; titulo: string; projetoCodigo: string | null; statusNome: string }[];
  disciplinas: { id: string; nome: string; projetoId: string }[];
};

const NONE = "__none";

/** Data local → "YYYY-MM-DD" (sem deslocamento de fuso). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const PRESETS_PRAZO: { label: string; calc: () => string }[] = [
  { label: "Hoje", calc: () => ymd(new Date()) },
  { label: "Amanhã", calc: () => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); } },
  { label: "+7 dias", calc: () => { const d = new Date(); d.setDate(d.getDate() + 7); return ymd(d); } },
  { label: "Fim do mês", calc: () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); } },
];

type FormTarefa = {
  titulo: string;
  descricao: string;
  statusId: string;
  prazo: string;
  prioridade: string;
  projetoId: string;
  disciplinaId: string;
  responsaveisIds: string[];
  itens: { id?: string; descricao: string; concluido: boolean; apontamentoHref?: string }[];
  dependeDeIds: string[];
};

export function TarefaDialog({
  tarefa,
  open,
  onOpenChange,
  opcoes,
  colunas,
  meId,
  meRole,
  valoresIniciais,
  onSubmit,
  itensReadonly,
  tituloDialog,
}: {
  tarefa: TarefaUI | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  opcoes: OpcoesUI;
  colunas: { id: string; nome: string }[];
  meId: string;
  meRole: string;
  /** Pré-preenche o formulário ao CRIAR (tarefa === null). */
  valoresIniciais?: Partial<FormTarefa>;
  /** Se definido, substitui criar/editar: recebe o payload e retorna se deu certo (fecha ao true). */
  onSubmit?: (
    payload: Omit<FormTarefa, "itens"> & { itens: { id?: string; descricao: string; concluido: boolean }[] },
  ) => Promise<boolean>;
  /** Checklist só-leitura (ex.: itens gerados por apontamentos). */
  itensReadonly?: boolean;
  /** Título do diálogo (sobrepõe o padrão). */
  tituloDialog?: string;
}) {
  // Item 27 (beta): só quem criou a tarefa (ou perfil global) edita/arquiva. Tarefa nova
  // (tarefa === null) é sempre editável — quem cria ainda não tem criadorId atribuído.
  const podeEditar =
    !tarefa || tarefa.criadorId === meId || GLOBAL_ROLES.includes(meRole as never);
  const router = useRouter();
  const [pending, start] = useTransition();
  const vazio = {
    titulo: "",
    descricao: "",
    statusId: colunas[0]?.id ?? "",
    prazo: "",
    prioridade: "",
    projetoId: NONE,
    disciplinaId: NONE,
    responsaveisIds: [] as string[],
    itens: [] as { id?: string; descricao: string; concluido: boolean; apontamentoHref?: string }[],
    dependeDeIds: [] as string[],
  };
  const deTarefa = (t: TarefaUI) => ({
    titulo: t.titulo,
    descricao: t.descricao,
    statusId: t.statusId,
    prazo: t.prazo,
    prioridade: t.prioridade,
    projetoId: t.projetoId || NONE,
    disciplinaId: t.disciplinaId || NONE,
    responsaveisIds: t.responsaveis.map((r) => r.id),
    itens: [...t.itens],
    dependeDeIds: [...t.dependeDeIds],
  });
  const inicial = () => (tarefa ? deTarefa(tarefa) : { ...vazio, ...valoresIniciais });
  const [form, setForm] = useState(inicial);
  const [novoItem, setNovoItem] = useState("");
  const [comentarios, setComentarios] = useState(tarefa?.comentarios ?? []);
  const [novoComent, setNovoComent] = useState("");
  const [comentFile, setComentFile] = useState<File | null>(null);
  const comentFileRef = useRef<HTMLInputElement>(null);
  const [buscaResp, setBuscaResp] = useState("");
  const [buscaDependencia, setBuscaDependencia] = useState("");
  const key = tarefa?.id ?? "nova";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(inicial());
    setNovoItem("");
    setComentarios(tarefa?.comentarios ?? []);
    setNovoComent("");
    setComentFile(null);
    setBuscaResp("");
    setBuscaDependencia("");
  }

  function enviarComentario() {
    if (!tarefa || (!novoComent.trim() && !comentFile)) return;
    const texto = novoComent;
    const arquivo = comentFile;
    setNovoComent("");
    setComentFile(null);
    start(async () => {
      let meta: { anexoPath?: string; anexoNome?: string; anexoMime?: string } = {};
      if (arquivo) {
        const fd = new FormData();
        fd.append("file", arquivo);
        const res = await fetch("/api/tarefas/anexo", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(j.error ?? "Falha no anexo.");
          return;
        }
        meta = j;
      }
      const r = await comentarTarefa({ tarefaId: tarefa.id, texto, ...meta });
      if (r.ok) {
        setComentarios((cs) => [
          ...cs,
          { id: r.data.id, autorId: meId, texto, autor: "Você", data: new Date().toISOString(), anexoMime: meta.anexoMime ?? null, anexoNome: meta.anexoNome ?? null },
        ]);
      } else toast.error(r.error);
    });
  }
  function excluirComentario(id: string) {
    start(async () => {
      const r = await removerComentario({ id });
      if (r.ok) setComentarios((cs) => cs.filter((c) => c.id !== id));
      else toast.error(r.error);
    });
  }

  function toggleArr(campo: "responsaveisIds" | "dependeDeIds", id: string) {
    setForm((f) => ({
      ...f,
      [campo]: f[campo].includes(id) ? f[campo].filter((x) => x !== id) : [...f[campo], id],
    }));
  }

  function toggleChecklist(idx: number) {
    const it = form.itens[idx];
    setForm((f) => ({
      ...f,
      itens: f.itens.map((x, i) => (i === idx ? { ...x, concluido: !x.concluido } : x)),
    }));
    // persiste imediato se item já existe no banco
    if (tarefa && it.id) {
      start(async () => {
        const r = await toggleItemTarefa({ id: it.id!, concluido: !it.concluido });
        if (r.ok) {
          router.refresh();
          return;
        }
        setForm((f) => ({
          ...f,
          itens: f.itens.map((item) => (item.id === it.id ? { ...item, concluido: it.concluido } : item)),
        }));
        toast.error(r.error);
      });
    }
  }

  function salvar() {
    const payload = {
      titulo: form.titulo,
      descricao: form.descricao,
      statusId: form.statusId,
      prazo: form.prazo,
      prioridade: (form.prioridade || "") as Prioridade | "",
      projetoId: form.projetoId === NONE ? "" : form.projetoId,
      disciplinaId: form.disciplinaId === NONE ? "" : form.disciplinaId,
      responsaveisIds: form.responsaveisIds,
      // `id` vai junto quando o item já existe: é o que faz `editarTarefa` ATUALIZAR a linha em
      // vez de apagar e recriar — recriar troca o id e orfana o `tarefaItemId` dos
      // apontamentos. Item novo não tem id e nasce no servidor.
      itens: form.itens.map((i) => ({ id: i.id, descricao: i.descricao, concluido: i.concluido })),
      dependeDeIds: form.dependeDeIds,
    };
    if (onSubmit) {
      // Fluxo customizado (ex.: enviar apontamentos): o chamador cria a tarefa.
      start(async () => {
        const ok = await onSubmit(payload);
        if (ok) onOpenChange(false);
      });
      return;
    }
    start(async () => {
      const r = tarefa ? await editarTarefa({ ...payload, id: tarefa.id }) : await criarTarefa(payload);
      if (r.ok) {
        toast.success(tarefa ? "Tarefa atualizada." : "Tarefa criada.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function arquivar() {
    if (!tarefa) return;
    start(async () => {
      const r = await arquivarTarefa({ id: tarefa.id });
      if (r.ok) {
        toast.success("Tarefa arquivada.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const tarefasDep = opcoes.tarefas.filter((t) => t.id !== tarefa?.id);
  const disciplinasProjeto =
    form.projetoId === NONE ? [] : opcoes.disciplinas.filter((d) => d.projetoId === form.projetoId);
  const responsaveisSelecionados = form.responsaveisIds
    .map((id) => opcoes.internos.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u);
  const dependenciasSelecionadas = form.dependeDeIds
    .map((id) => tarefasDep.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);
  const termoResponsavel = buscaResp.trim().toLowerCase();
  const responsaveisEncontrados = termoResponsavel
    ? opcoes.internos
        .filter((u) => !form.responsaveisIds.includes(u.id) && u.name.toLowerCase().includes(termoResponsavel))
        .slice(0, 8)
    : [];
  const termoDependencia = buscaDependencia.trim().toLowerCase();
  const dependenciasEncontradas = termoDependencia.length >= 2
    ? tarefasDep
        .filter((t) => !form.dependeDeIds.includes(t.id) && t.titulo.toLowerCase().includes(termoDependencia))
        .slice(0, 8)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tituloDialog ?? (tarefa ? tarefa.titulo : "Nova tarefa")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!podeEditar && (
            <p className="rounded-sm border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning-foreground">
              Só quem criou esta tarefa (ou admin/supervisor) pode editar seus dados.
              {!itensReadonly && " Você ainda pode marcar os itens do checklist."}
            </p>
          )}
          <fieldset disabled={!podeEditar} className="contents">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <textarea
              rows={2}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Coluna</Label>
              <Select value={form.statusId} onValueChange={(v) => setForm((f) => ({ ...f, statusId: v ?? f.statusId }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colunas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prazo</Label>
              <Input type="date" value={form.prazo} onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select
                value={form.projetoId}
                onValueChange={(v) => setForm((f) => ({ ...f, projetoId: v ?? NONE, disciplinaId: NONE }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {opcoes.projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {formatarCodigo(p.codigo)} — {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {disciplinasProjeto.length > 0 && (
            <div className="space-y-1.5">
              <Label>Disciplina</Label>
              <Select
                value={form.disciplinaId}
                onValueChange={(v) => setForm((f) => ({ ...f, disciplinaId: v ?? NONE }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— (sem disciplina)</SelectItem>
                  {disciplinasProjeto.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select
                value={form.prioridade || NONE}
                onValueChange={(v) => setForm((f) => ({ ...f, prioridade: v === NONE ? "" : (v ?? "") }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORIDADE_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Atalhos de prazo</Label>
              <div className="flex flex-wrap gap-1">
                {PRESETS_PRAZO.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setForm((f) => ({ ...f, prazo: p.calc() }))}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Vínculos</Label>
            <div className="divide-y rounded-sm border">
              <div className="flex min-h-10 items-center gap-2 px-2.5 py-1.5">
                <UsersRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Responsáveis</span>
                <span className="min-w-0 flex-1 truncate text-sm" title={responsaveisSelecionados.map((u) => u.name).join(", ")}>
                  {responsaveisSelecionados.length === 0
                    ? <span className="text-muted-foreground">Ninguém atribuído</span>
                    : <>{responsaveisSelecionados.slice(0, 2).map((u) => u.name).join(" · ")}{responsaveisSelecionados.length > 2 && <span className="font-mono text-xs text-muted-foreground"> +{responsaveisSelecionados.length - 2}</span>}</>}
                </span>
                <Popover onOpenChange={(open) => !open && setBuscaResp("")}>
                  <PopoverTrigger
                    render={
                      <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs">
                        {responsaveisSelecionados.length > 0 ? "Alterar" : "Adicionar"}
                      </Button>
                    }
                  />
                  <PopoverContent align="end" className="w-80 gap-0 p-0">
                    <div className="border-b px-3 py-2">
                      <p className="text-sm font-semibold">Responsáveis</p>
                      <p className="text-xs text-muted-foreground">Busque e atribua pessoas à tarefa.</p>
                    </div>
                    {responsaveisSelecionados.length > 0 && (
                      <div className="border-b px-3 py-2">
                        <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Atribuídos</p>
                        <div className="flex flex-wrap gap-1">
                          {responsaveisSelecionados.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => toggleArr("responsaveisIds", u.id)}
                              className="inline-flex items-center gap-1 rounded-sm border border-primary bg-primary px-1.5 py-0.5 text-xs text-primary-foreground"
                            >
                              {u.name} <X className="size-3" aria-hidden />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="p-2.5">
                      <Input
                        value={buscaResp}
                        onChange={(e) => setBuscaResp(e.target.value)}
                        placeholder="Buscar por nome…"
                        aria-label="Buscar responsável"
                        className="h-8 text-sm"
                      />
                      {termoResponsavel ? (
                        responsaveisEncontrados.length > 0 ? (
                          <div className="mt-2 divide-y rounded-sm border">
                            {responsaveisEncontrados.map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => toggleArr("responsaveisIds", u.id)}
                                className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                              >
                                <span>{u.name}</span>
                                <span className="text-primary">+ atribuir</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="px-1 pt-2 text-xs text-muted-foreground">Nenhuma pessoa encontrada.</p>
                        )
                      ) : (
                        <p className="px-1 pt-2 text-xs text-muted-foreground">Digite um nome para buscar.</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {tarefasDep.length > 0 && (
                <div className="flex min-h-10 items-center gap-2 px-2.5 py-1.5">
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Dependências</span>
                  <span className="min-w-0 flex-1 truncate text-sm" title={dependenciasSelecionadas.map((t) => t.titulo).join(", ")}>
                    {dependenciasSelecionadas.length === 0
                      ? <span className="text-muted-foreground">Nenhuma</span>
                      : <>{dependenciasSelecionadas.slice(0, 1).map((t) => t.titulo)}{dependenciasSelecionadas.length > 1 && <span className="font-mono text-xs text-muted-foreground"> +{dependenciasSelecionadas.length - 1}</span>}</>}
                  </span>
                  <Popover onOpenChange={(open) => !open && setBuscaDependencia("")}>
                    <PopoverTrigger
                      render={
                        <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs">
                          {dependenciasSelecionadas.length > 0 ? "Alterar" : "Adicionar"}
                        </Button>
                      }
                    />
                    <PopoverContent align="end" className="w-80 gap-0 p-0">
                      <div className="border-b px-3 py-2">
                        <p className="text-sm font-semibold">Dependências</p>
                        <p className="text-xs text-muted-foreground">Escolha tarefas que precisam ser concluídas antes desta.</p>
                      </div>
                      {dependenciasSelecionadas.length > 0 && (
                        <div className="border-b px-3 py-2">
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Selecionadas</p>
                          <div className="space-y-1">
                            {dependenciasSelecionadas.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => toggleArr("dependeDeIds", t.id)}
                                className="flex w-full items-center justify-between gap-2 rounded-sm px-1.5 py-1 text-left text-xs hover:bg-muted/50"
                              >
                                <span className="truncate">{t.titulo}</span>
                                <X className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="p-2.5">
                        <Input
                          value={buscaDependencia}
                          onChange={(e) => setBuscaDependencia(e.target.value)}
                          placeholder="Buscar tarefa…"
                          aria-label="Buscar dependência"
                          className="h-8 text-sm"
                        />
                        {termoDependencia.length >= 2 ? (
                          dependenciasEncontradas.length > 0 ? (
                            <div className="mt-2 divide-y rounded-sm border">
                              {dependenciasEncontradas.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => toggleArr("dependeDeIds", t.id)}
                                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate">{t.titulo}</span>
                                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                                      {t.projetoCodigo ? formatarCodigo(t.projetoCodigo) : "Sem projeto"} · {t.statusNome}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-primary">+ adicionar</span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="px-1 pt-2 text-xs text-muted-foreground">Nenhuma tarefa encontrada.</p>
                          )
                        ) : (
                          <p className="px-1 pt-2 text-xs text-muted-foreground">Digite ao menos 2 caracteres para buscar.</p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </div>

          </fieldset>

          <div className="space-y-1.5">
            <Label>Checklist{itensReadonly && " (apontamentos)"}</Label>
            {form.itens.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={it.concluido}
                    onChange={() => toggleChecklist(i)}
                    disabled={itensReadonly || pending}
                    className="size-4 accent-primary"
                  />
                  <span className={`text-sm ${it.concluido ? "text-muted-foreground line-through" : ""}`}>
                    {it.descricao}
                  </span>
                </label>
                {it.apontamentoHref && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-primary"
                    aria-label="Ver o apontamento na maquete 3D"
                    title="Abrir o apontamento na maquete 3D"
                    render={<Link href={it.apontamentoHref} target="_blank" rel="noreferrer" />}
                  >
                    <Box className="size-3.5" />
                  </Button>
                )}
                {podeEditar && !itensReadonly && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover item"
                    onClick={() => setForm((f) => ({ ...f, itens: f.itens.filter((_, idx) => idx !== i) }))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {podeEditar && !itensReadonly && (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Novo item…"
                  value={novoItem}
                  onChange={(e) => setNovoItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && novoItem.trim()) {
                      setForm((f) => ({ ...f, itens: [...f.itens, { descricao: novoItem, concluido: false }] }));
                      setNovoItem("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!novoItem.trim()) return;
                    setForm((f) => ({ ...f, itens: [...f.itens, { descricao: novoItem, concluido: false }] }));
                    setNovoItem("");
                  }}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            )}
          </div>

          {tarefa && (
            <div className="space-y-1.5 border-t pt-3">
              <Label>Comentários</Label>
              {comentarios.length > 0 && (
                <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                  {comentarios.map((c) => (
                    <li key={c.id} className="rounded-sm bg-muted/50 px-2 py-1 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] font-semibold text-muted-foreground">{c.autor}</span>
                        {(c.autorId === meId || meRole === "admin") && (
                          <button type="button" onClick={() => excluirComentario(c.id)} aria-label="Remover comentário" className="text-muted-foreground hover:text-foreground">
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                      {c.texto && <p className="whitespace-pre-wrap break-words">{c.texto}</p>}
                      {c.anexoMime && (
                        <a
                          href={`/api/tarefas/anexo/${c.id}`}
                          {...(c.anexoMime?.startsWith("image/") ? { target: "_blank", rel: "noreferrer" } : {})}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <FileText className="size-3" /> {c.anexoNome ?? "anexo"}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {comentFile && (
                <div className="flex items-center gap-2 rounded-sm border bg-muted/40 px-2 py-1 text-xs">
                  <Paperclip className="size-3 shrink-0" />
                  <span className="flex-1 truncate">{comentFile.name}</span>
                  <button type="button" onClick={() => setComentFile(null)} aria-label="Remover anexo">
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input ref={comentFileRef} type="file" hidden onChange={(e) => { setComentFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                <Button size="icon" variant="ghost" type="button" onClick={() => comentFileRef.current?.click()} aria-label="Anexar">
                  <Paperclip className="size-4" />
                </Button>
                <Input
                  value={novoComent}
                  onChange={(e) => setNovoComent(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), enviarComentario())}
                  placeholder="Comentar…"
                />
                <Button size="icon" type="button" onClick={enviarComentario} disabled={pending} aria-label="Enviar">
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {tarefa && podeEditar ? (
            <Button variant="ghost" size="sm" onClick={arquivar} disabled={pending}>
              <Archive className="size-3.5" /> Arquivar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending || !form.titulo || !podeEditar}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
