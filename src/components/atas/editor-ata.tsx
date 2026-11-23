"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, Quote, Save, Send, Trash2 } from "lucide-react";
import { descartarRascunhoAta, publicarAta, salvarRascunhoAta } from "@/modules/portal/atas/actions";
import type { AtaParaEditar } from "@/modules/portal/atas/queries";
import { DESCRICAO_ITEM_MAX, TEXTO_MAX, TITULO_ITEM_MAX, TITULO_MAX, motivoParaPublicar, type ItemRascunho } from "@/modules/portal/atas/regras";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ItemAtaLinha } from "./item-ata-linha";
import { CLASSE_TEXTAREA } from "./motivo-dialog";
import { TextoAta } from "./texto-ata";

const FALHA = "Não foi possível enviar. Verifique a conexão e tente de novo.";
const novaChave = () => `novo-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
const cortar = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** Parágrafos do texto (separados por linha em branco), sem títulos — candidatos a "Virar decisão". */
function paragrafos(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\s*[-*]\s+/gm, "").trim())
    .filter((p) => p.length > 0 && !/^#+\s/.test(p));
}

/**
 * Editor do rascunho da ata (página própria dentro do projeto): título, data, texto que o cliente vai ler, e os itens —
 * decisão, tarefa da equipe (responsável obrigatório) ou pendência do cliente. Publicar salva antes e pede confirmação com
 * o projeto e o cliente em destaque (o erro mais caro é publicar no projeto errado).
 */
export function EditorAta({ dados }: { dados: AtaParaEditar }) {
  const router = useRouter();
  const confirm = useConfirm();
  const rascunho = dados.reuniao.rascunho!;
  const voltar = `/projetos/${dados.projeto.id}/cliente#atas`;
  const [titulo, setTitulo] = useState(dados.reuniao.titulo);
  const [data, setData] = useState(dados.reuniao.data);
  const [texto, setTexto] = useState(rascunho.texto);
  const [itens, setItens] = useState<ItemRascunho[]>(() =>
    rascunho.itens.map((i) => ({ chave: i.chave, tipo: i.tipo, titulo: i.titulo, descricao: i.descricao, responsavelId: i.responsavelId, prazo: i.prazo })),
  );
  const [previa, setPrevia] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [ocupado, start] = useTransition();
  const ids = { titulo: useId(), data: useId(), texto: useId() };
  const membros = useMemo(() => new Set(dados.membros.map((m) => m.id)), [dados.membros]);
  const motivoPublicar = motivoParaPublicar({ texto, itens, membros }) ?? (titulo.trim() ? null : "Dê um título à reunião.");

  const mudar = (i: number, novo: ItemRascunho) => setItens((xs) => xs.map((x, k) => (k === i ? novo : x)));
  const mover = (i: number, d: -1 | 1) =>
    setItens((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const c = [...xs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const adicionar = (tipo: ItemRascunho["tipo"], tituloNovo = "", descricao: string | null = null) =>
    setItens((xs) => [...xs, { chave: novaChave(), tipo, titulo: tituloNovo, descricao, responsavelId: null, prazo: null }]);

  async function salvar(): Promise<boolean> {
    const r = await salvarRascunhoAta({ versaoId: rascunho.id, titulo, data, texto, itens }).catch(() => null);
    if (!r) {
      toast.error(FALHA);
      return false;
    }
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    return true;
  }

  function aoSalvar() {
    start(async () => {
      if (await salvar()) toast.success("Rascunho salvo.");
    });
  }

  async function aoDescartar() {
    const ok = await confirm({
      title: "Descartar o rascunho?",
      description: dados.reuniao.vigente
        ? "A correção é descartada; a versão publicada continua valendo."
        : "A reunião é apagada, com os arquivos anexados. O cliente não viu nada.",
      confirmLabel: "Descartar",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await descartarRascunhoAta({ versaoId: rascunho.id }).catch(() => null);
      if (!r) return void toast.error(FALHA);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Rascunho descartado.");
      router.push(voltar);
    });
  }

  function aoPublicar() {
    start(async () => {
      if (!(await salvar())) return;
      const r = await publicarAta({ versaoId: rascunho.id }).catch(() => null);
      if (!r) return void toast.error(FALHA);
      if (!r.ok) return void toast.error(r.error);
      setPublicando(false);
      toast.success(dados.reuniao.vigente ? "Versão corrigida publicada." : "Ata publicada no portal.");
      router.push(voltar);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href={voltar} className="inline-flex items-center gap-1 text-sm underline underline-offset-2">
          <ArrowLeft className="size-4" aria-hidden /> Voltar para a aba Cliente
        </a>
        <p className="text-sm text-muted-foreground">
          {dados.reuniao.vigente ? `Correção da versão ${dados.reuniao.vigente.numero} (rascunho da versão ${rascunho.numero})` : "Rascunho — o cliente ainda não vê"}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ata da reunião</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="space-y-1.5">
              <Label htmlFor={ids.titulo}>Título</Label>
              <Input id={ids.titulo} value={titulo} maxLength={TITULO_MAX} disabled={ocupado} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.data}>Data da reunião</Label>
              <Input id={ids.data} type="date" value={data} disabled={ocupado} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={ids.texto}>Texto que o cliente vai ler</Label>
              <Button size="sm" variant="ghost" aria-pressed={previa} onClick={() => setPrevia((v) => !v)}>
                {previa ? "Editar" : "Ver como o cliente vê"}
              </Button>
            </div>
            {previa ? (
              <div className="min-h-32 rounded-sm border px-3 py-2">
                <TextoAta texto={texto} />
              </div>
            ) : (
              <textarea id={ids.texto} rows={14} maxLength={TEXTO_MAX} className={CLASSE_TEXTAREA} value={texto} disabled={ocupado} onChange={(e) => setTexto(e.target.value)} />
            )}
            <p className="text-xs text-muted-foreground">
              Revise o que o Gemini escreveu: o cliente lê exatamente este texto. Aceita **negrito**, listas com &ldquo;-&rdquo; e títulos com &ldquo;###&rdquo;.
            </p>
          </div>
          <CollapsibleSection titulo="Transformar um trecho em decisão" descricao="Para atas sem a seção Decisões: escolha o parágrafo que registra o que foi decidido.">
            <ul className="space-y-2">
              {paragrafos(texto).map((p, i) => (
                <li key={i} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <p className="min-w-0 flex-1 break-words text-muted-foreground">{cortar(p, 240)}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupado}
                    onClick={() => adicionar("decisao", cortar(p, TITULO_ITEM_MAX), p.length > TITULO_ITEM_MAX ? cortar(p, DESCRICAO_ITEM_MAX) : null)}
                  >
                    <Quote className="size-4" aria-hidden /> Virar decisão
                  </Button>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Decisões e tarefas ({itens.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => adicionar("decisao")}>
              <Plus className="size-4" aria-hidden /> Decisão
            </Button>
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => adicionar("tarefa_equipe")}>
              <Plus className="size-4" aria-hidden /> Tarefa da equipe
            </Button>
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => adicionar("pendencia_cliente")}>
              <Plus className="size-4" aria-hidden /> Pendência do cliente
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item. Adicione as decisões e as tarefas combinadas na reunião.</p>
          ) : (
            <ol className="space-y-3">
              {itens.map((it, i) => (
                <ItemAtaLinha
                  key={it.chave}
                  item={it}
                  indice={i}
                  total={itens.length}
                  membros={dados.membros}
                  desabilitado={ocupado}
                  onMudar={(novo) => mudar(i, novo)}
                  onMover={(d) => mover(i, d)}
                  onRemover={() => setItens((xs) => xs.filter((_, k) => k !== i))}
                />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {motivoPublicar && <p className="mr-auto text-sm text-muted-foreground">Para publicar: {motivoPublicar}</p>}
        <Button variant="ghost" disabled={ocupado} onClick={() => void aoDescartar()}>
          <Trash2 className="size-4" aria-hidden /> Descartar
        </Button>
        <Button variant="outline" disabled={ocupado} onClick={aoSalvar}>
          <Save className="size-4" aria-hidden /> Salvar rascunho
        </Button>
        <Button disabled={ocupado || motivoPublicar !== null} onClick={() => setPublicando(true)}>
          <Send className="size-4" aria-hidden /> Publicar no portal
        </Button>
      </div>

      <Dialog open={publicando} onOpenChange={(o) => !ocupado && setPublicando(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publicar a ata para o cliente?</DialogTitle>
            <DialogDescription>Confira o projeto e o cliente: a ata vai para o portal e por e-mail para as contas dele.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">Projeto</dt>
              <dd className="break-words font-semibold">
                {formatarCodigo(dados.projeto.codigo)} — {dados.projeto.nome}
              </dd>
              <dt className="text-muted-foreground">Cliente</dt>
              <dd className="break-words font-semibold">{dados.projeto.cliente ?? "—"}</dd>
              <dt className="text-muted-foreground">Reunião</dt>
              <dd className="break-words">{titulo}</dd>
            </dl>
            <p className="text-sm text-muted-foreground">
              {itens.filter((i) => i.tipo === "tarefa_equipe").length} tarefa(s) da equipe entram no quadro de Tarefas;{" "}
              {itens.filter((i) => i.tipo === "pendencia_cliente").length} pendência(s) aparecem para o cliente.
            </p>
            {dados.contasAtivas === 0 && (
              <p className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-text">
                Este cliente não tem conta ativa no portal: a ata fica registrada, sem confirmação.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" disabled={ocupado} onClick={() => setPublicando(false)}>
              Voltar
            </Button>
            <Button disabled={ocupado} onClick={aoPublicar}>
              <span role="status">{ocupado ? "Publicando…" : "Publicar"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
