"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mail, Send, Save, Plus, Pencil, Trash2, X, Shuffle, Pin } from "lucide-react";
import {
  salvarVariante,
  definirVarianteAtiva,
  excluirVariante,
  enviarEmailTeste,
} from "@/modules/configuracoes/emails/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type Variante = { id: string; nome: string; assunto: string; corpoHtml: string; ativo: boolean };

type Categoria = {
  slug: string;
  grupo: string;
  label: string;
  descricao: string;
  variaveis: { nome: string; descricao: string; exemplo: string }[];
  assuntoPadrao: string;
  corpoPadrao: string;
  variantes: Variante[];
  ativos: number;
};

type Editando = { id: string | null; nome: string; assunto: string; corpo: string; ativo: boolean };

/** Substitui `{{var}}` pelos valores de exemplo (preview client-side). */
function substituir(tpl: string, exemplos: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => exemplos[k] ?? "");
}

export function EmailsView({ categorias, smtpAtivo }: { categorias: Categoria[]; smtpAtivo: boolean }) {
  const router = useRouter();
  const [slug, setSlug] = useState(categorias[0]?.slug ?? "");
  const [editando, setEditando] = useState<Editando | null>(null);
  const [pending, start] = useTransition();
  const confirm = useConfirm();

  const grupos = useMemo(() => {
    const mapa = new Map<string, Categoria[]>();
    for (const c of categorias) {
      const arr = mapa.get(c.grupo) ?? [];
      arr.push(c);
      mapa.set(c.grupo, arr);
    }
    return [...mapa.entries()];
  }, [categorias]);

  const atual = useMemo(() => categorias.find((c) => c.slug === slug), [categorias, slug]);
  const exemplos = useMemo(
    () => Object.fromEntries((atual?.variaveis ?? []).map((v) => [v.nome, v.exemplo])),
    [atual],
  );

  function selecionarCategoria(c: Categoria) {
    setSlug(c.slug);
    setEditando(null);
  }
  function novoModelo() {
    if (!atual) return;
    const n = atual.variantes.length + 1;
    setEditando({
      id: null,
      nome: `Modelo ${n}`,
      assunto: atual.assuntoPadrao,
      corpo: atual.corpoPadrao,
      ativo: true,
    });
  }
  function editar(v: Variante) {
    setEditando({ id: v.id, nome: v.nome, assunto: v.assunto, corpo: v.corpoHtml, ativo: v.ativo });
  }

  function salvar() {
    if (!editando || !atual) return;
    start(async () => {
      const r = await salvarVariante({
        id: editando.id ?? undefined,
        slug: atual.slug,
        nome: editando.nome,
        assunto: editando.assunto,
        corpoHtml: editando.corpo,
        ativo: editando.ativo,
      });
      if (r.ok) {
        toast.success("Modelo salvo.");
        setEditando(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function alternarAtivo(v: Variante) {
    start(async () => {
      const r = await definirVarianteAtiva({ id: v.id, ativo: !v.ativo });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  async function excluir(v: Variante) {
    if (!(await confirm({ title: `Excluir "${v.nome}"?`, description: "Esta ação não pode ser desfeita.", variant: "destructive", confirmLabel: "Excluir" })))
      return;
    start(async () => {
      const r = await excluirVariante({ id: v.id });
      if (r.ok) {
        toast.success("Modelo excluído.");
        if (editando?.id === v.id) setEditando(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function testar() {
    if (!atual) return;
    start(async () => {
      const r = await enviarEmailTeste({
        slug: atual.slug,
        assunto: editando?.assunto,
        corpoHtml: editando?.corpo,
      });
      if (r.ok) toast.success(`E-mail de teste enviado para ${r.data.para}.`);
      else toast.error(r.error);
    });
  }

  function statusCategoria(c: Categoria): { texto: string; icon: typeof Pin } {
    if (c.ativos === 0) return { texto: "Sem modelos ativos — usando o texto padrão do sistema.", icon: Mail };
    if (c.ativos === 1) return { texto: "1 modelo ativo (fixo).", icon: Pin };
    return { texto: `${c.ativos} modelos ativos — cada envio sorteia um.`, icon: Shuffle };
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Modelos de e-mail</h2>
        <p className="text-sm text-muted-foreground">
          Cada categoria pode ter vários modelos. Marque um como ativo (fixo) ou vários (o envio sorteia
          um). O corpo usa Markdown; variáveis entre chaves (ex.:{" "}
          <code className="rounded bg-muted px-1">{"{{nome}}"}</code>) são preenchidas no envio.
        </p>
        {!smtpAtivo && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
            SMTP não configurado — os e-mails não serão enviados até definir SMTP_HOST no ambiente.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Categorias (agrupadas) */}
        <div className="space-y-3">
          {grupos.map(([grupo, itens]) => (
            <div key={grupo} className="space-y-1">
              <p className="px-1 text-[11px] font-bold tracking-tight text-muted-foreground/70 uppercase">
                {grupo}
              </p>
              {itens.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => selecionarCategoria(c)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    c.slug === slug ? "border-primary bg-primary/10" : "border-input hover:bg-muted",
                  )}
                >
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.variantes.length > 0 ? (
                    <Badge variant={c.ativos > 0 ? "default" : "secondary"} className="shrink-0 text-[10px]">
                      {c.ativos}/{c.variantes.length}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                      padrão
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Categoria selecionada */}
        {atual && (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium">{atual.label}</h3>
              <p className="text-xs text-muted-foreground">{atual.descricao}</p>
            </div>

            {/* Status + lista de modelos */}
            {(() => {
              const st = statusCategoria(atual);
              return (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <st.icon className="size-3.5" /> {st.texto}
                </p>
              );
            })()}

            <div className="space-y-1.5">
              {atual.variantes.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2",
                    editando?.id === v.id && "border-primary",
                  )}
                >
                  <Switch checked={v.ativo} onCheckedChange={() => alternarAtivo(v)} disabled={pending} />
                  <button
                    type="button"
                    onClick={() => editar(v)}
                    className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                  >
                    {v.nome}
                    {!v.ativo && <span className="ml-1.5 text-xs text-muted-foreground">(inativo)</span>}
                  </button>
                  <Button variant="ghost" size="icon-sm" onClick={() => editar(v)} aria-label="Editar">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => excluir(v)} aria-label="Excluir">
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              ))}
              {!editando && (
                <Button variant="outline" size="sm" onClick={novoModelo}>
                  <Plus className="size-3.5" /> Novo modelo
                </Button>
              )}
            </div>

            {/* Editor */}
            {editando && (
              <Card>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {editando.id ? "Editar modelo" : "Novo modelo"}
                    </span>
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditando(null)} aria-label="Fechar">
                      <X className="size-4" />
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Nome do modelo</Label>
                    <Input
                      value={editando.nome}
                      onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                      placeholder="Ex.: Formal, Descontraído…"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Assunto</Label>
                    <Input
                      value={editando.assunto}
                      onChange={(e) => setEditando({ ...editando, assunto: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Corpo (Markdown)</Label>
                    <textarea
                      value={editando.corpo}
                      onChange={(e) => setEditando({ ...editando, corpo: e.target.value })}
                      rows={10}
                      spellCheck={false}
                      className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    />
                    <LegendaMarkdown />
                  </div>

                  {atual.variaveis.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Variáveis disponíveis</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {atual.variaveis.map((v) => (
                          <code key={v.nome} title={v.descricao} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {`{{${v.nome}}}`}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Pré-visualização (com valores de exemplo)</Label>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="mb-1 text-sm font-semibold">{substituir(editando.assunto, exemplos)}</p>
                      <div className="prose prose-sm max-w-none text-sm dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {substituir(editando.corpo, exemplos)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-sm border p-3">
                    <div>
                      <Label className="text-sm font-medium">Ativo</Label>
                      <p className="text-xs text-muted-foreground">Entra no sorteio de envio.</p>
                    </div>
                    <Switch
                      checked={editando.ativo}
                      onCheckedChange={(v: boolean) => setEditando({ ...editando, ativo: v })}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={salvar} disabled={pending}>
                      <Save className="size-3.5" /> Salvar
                    </Button>
                    <Button variant="outline" onClick={testar} disabled={pending || !smtpAtivo}>
                      <Send className="size-3.5" /> Enviar teste
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Guia rápido de formatação Markdown para quem não conhece a sintaxe. */
const EXEMPLOS_MD: { escreva: string; resultado: string }[] = [
  { escreva: "**negrito**", resultado: "negrito (em destaque)" },
  { escreva: "*itálico*", resultado: "itálico (inclinado)" },
  { escreva: "# Título", resultado: "título grande" },
  { escreva: "## Subtítulo", resultado: "título menor" },
  { escreva: "[texto do link](https://site.com)", resultado: "link clicável" },
  { escreva: "- item", resultado: "lista com marcadores" },
  { escreva: "1. item", resultado: "lista numerada" },
  { escreva: "linha em branco", resultado: "separa parágrafos" },
  { escreva: "---", resultado: "linha divisória" },
];

function LegendaMarkdown() {
  return (
    <details className="rounded-lg border bg-muted/30 text-xs">
      <summary className="cursor-pointer px-3 py-2 font-medium select-none">
        Como formatar o texto? (guia de Markdown)
      </summary>
      <div className="border-t px-3 py-2">
        <p className="mb-2 text-muted-foreground">
          Escreva normalmente. Para dar formatação, use os símbolos abaixo. As{" "}
          <code className="rounded bg-muted px-1">{"{{variáveis}}"}</code> são preenchidas
          automaticamente no envio.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-4 font-medium">Você escreve</th>
                <th className="py-1 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {EXEMPLOS_MD.map((e) => (
                <tr key={e.escreva} className="border-t border-border/50">
                  <td className="py-1 pr-4">
                    <code className="rounded bg-muted px-1 py-0.5">{e.escreva}</code>
                  </td>
                  <td className="py-1 text-muted-foreground">{e.resultado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-muted-foreground">
          Tabelas: use <code className="rounded bg-muted px-1">| Coluna A | Coluna B |</code> com uma
          linha <code className="rounded bg-muted px-1">| --- | --- |</code> abaixo do cabeçalho. Veja a
          pré-visualização para conferir o resultado.
        </p>
      </div>
    </details>
  );
}
