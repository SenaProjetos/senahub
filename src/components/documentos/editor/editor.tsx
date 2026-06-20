"use client";

import { useReducer, useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Eye,
  Undo2,
  Redo2,
  Type,
  Braces,
  Pilcrow,
  PenLine,
  Minus,
  Square,
  Image as ImageIcon,
  Table,
  ZoomIn,
  ZoomOut,
  History,
  Plus,
  HelpCircle,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Library,
  BookmarkPlus,
  Trash2,
} from "lucide-react";
import {
  novoElemento,
  novoId,
  TIPOS_BANDA,
  BANDA_LABEL,
  type DocSchema,
  type Elemento,
  type TipoBanda,
  type TipoElemento,
} from "@/modules/documentos/schema";
import { FONTES } from "@/modules/documentos/fontes-meta";
import type { FonteTipografica } from "@/modules/documentos/fontes-tipograficas";
import { salvarModelo, restaurarVersao } from "@/modules/documentos/actions";
import { salvarBloco, excluirBloco } from "@/modules/documentos/bloco-actions";
import type { BlocoListItem } from "@/modules/documentos/bloco-queries";
import { editorReducer, type AlinharEixo, type DistribuirEixo, type EditorState } from "./estado";
import { Canvas } from "./canvas";
import { Propriedades } from "./propriedades";
import { VariaveisDialog } from "../variaveis-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";

type VersaoT = { id: string; numero: number; autor: string; data: string };
type TipoDoc = "relatorio" | "proposta" | "contrato" | "recibo" | "holerite" | "outro";

const TIPOS_DOC: { v: TipoDoc; l: string }[] = [
  { v: "relatorio", l: "Relatório" },
  { v: "proposta", l: "Proposta" },
  { v: "contrato", l: "Contrato" },
  { v: "recibo", l: "Recibo" },
  { v: "holerite", l: "Holerite" },
  { v: "outro", l: "Outro" },
];

const PALETA: { tipo: TipoElemento; label: string; icone: React.ElementType }[] = [
  { tipo: "label", label: "Texto / título", icone: Type },
  { tipo: "campo", label: "Campo de dados", icone: Braces },
  { tipo: "paragrafo", label: "Parágrafo (multilinha)", icone: Pilcrow },
  { tipo: "assinatura", label: "Assinatura", icone: PenLine },
  { tipo: "linha", label: "Linha", icone: Minus },
  { tipo: "retangulo", label: "Retângulo", icone: Square },
  { tipo: "imagem", label: "Imagem / logo", icone: ImageIcon },
  { tipo: "tabela", label: "Tabela", icone: Table },
];

export function DocEditor({
  modeloId,
  nomeInicial,
  tipoInicial,
  fonteInicial,
  schemaInicial,
  fontesHabilitadas,
  fontesDados,
  datasets,
  fonteColunas,
  blocos,
  versoes,
}: {
  modeloId: string;
  nomeInicial: string;
  tipoInicial: TipoDoc;
  fonteInicial: string;
  schemaInicial: DocSchema;
  fontesHabilitadas: FonteTipografica[];
  /** Fontes de sistema (id+label) que o usuário pode ver — filtradas no server. */
  fontesDados: { id: string; label: string }[];
  /** Datasets de CSV disponíveis como fonte (convenção `dataset:<id>`). */
  datasets: { id: string; nome: string }[];
  /** Colunas do dataset quando a fonte salva do modelo é um dataset (tokens). */
  fonteColunas: string[];
  blocos: BlocoListItem[];
  versoes: VersaoT[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, dispatch] = useReducer(editorReducer, {
    schema: schemaInicial,
    selecao: { tipo: "nenhuma" },
    past: [],
    future: [],
    sujo: false,
  } satisfies EditorState);
  const [nome, setNome] = useState(nomeInicial);
  const [tipo, setTipo] = useState<TipoDoc>(tipoInicial);
  const [fonte, setFonte] = useState(fonteInicial);
  const [zoom, setZoom] = useState(1);

  const bandaAlvo = useCallback((): string | null => {
    if (state.selecao.tipo !== "nenhuma") return state.selecao.bandaId;
    return state.schema.bandas.find((b) => b.tipo === "cabecalho")?.id ?? state.schema.bandas[0]?.id ?? null;
  }, [state.selecao, state.schema.bandas]);

  function adicionar(tipoEl: TipoElemento) {
    const bandaId = bandaAlvo();
    if (!bandaId) return;
    dispatch({ t: "addElemento", bandaId, elemento: novoElemento(tipoEl, 8, 8) });
  }

  // Ids selecionados na banda corrente (1 = simples; 2+ = multi-seleção).
  const selBandaId =
    state.selecao.tipo === "elemento" || state.selecao.tipo === "multi"
      ? state.selecao.bandaId
      : null;
  const selIds: string[] =
    state.selecao.tipo === "elemento"
      ? [state.selecao.elementoId]
      : state.selecao.tipo === "multi"
        ? state.selecao.ids
        : [];
  const temSelecaoElementos = selIds.length >= 1;
  const temMulti = selIds.length >= 2;

  /** Elementos atualmente selecionados (objetos), para salvar como bloco. */
  function elementosSelecionados(): Elemento[] {
    if (!selBandaId) return [];
    const banda = state.schema.bandas.find((b) => b.id === selBandaId);
    if (!banda) return [];
    return banda.elementos.filter((e) => selIds.includes(e.id));
  }

  function alinhar(eixo: AlinharEixo) {
    if (selBandaId && temMulti) dispatch({ t: "alinhar", bandaId: selBandaId, ids: selIds, eixo });
  }
  function distribuir(eixo: DistribuirEixo) {
    if (selBandaId && selIds.length >= 3) dispatch({ t: "distribuir", bandaId: selBandaId, ids: selIds, eixo });
  }

  /**
   * Insere os elementos de um bloco na banda selecionada (ou na 1ª disponível),
   * regerando ids e aplicando um pequeno offset para não sobrepor o original.
   */
  function inserirBloco(bloco: BlocoListItem) {
    const bandaId = bandaAlvo();
    if (!bandaId) {
      toast.error("Nenhuma banda disponível para inserir.");
      return;
    }
    const elementos: Elemento[] = bloco.conteudo.map((e) => ({
      ...e,
      id: novoId(),
      x: e.x + 16,
      y: e.y + 16,
    }));
    dispatch({ t: "inserirElementos", bandaId, elementos });
    toast.success(`Bloco "${bloco.nome}" inserido (${elementos.length} elemento(s)).`);
  }

  function salvar() {
    start(async () => {
      const r = await salvarModelo({
        id: modeloId,
        nome,
        tipo,
        fonte,
        schemaJson: state.schema,
      });
      if (r.ok) {
        toast.success(`Salvo (versão ${r.data.versao}).`);
        dispatch({ t: "marcarSalvo" });
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // Atalhos: Delete, Ctrl+Z/Y, Ctrl+S, setas
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable) return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ t: "undo" });
      } else if (e.ctrlKey && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        dispatch({ t: "redo" });
      } else if (e.key === "Delete" && state.selecao.tipo === "elemento") {
        dispatch({ t: "removeElemento", bandaId: state.selecao.bandaId, elementoId: state.selecao.elementoId });
      } else if (e.key === "Delete" && state.selecao.tipo === "multi") {
        // Remove cada elemento da multi-seleção (cada um empilha no histórico).
        const sel = state.selecao;
        for (const id of sel.ids) dispatch({ t: "removeElemento", bandaId: sel.bandaId, elementoId: id });
      } else if (state.selecao.tipo === "elemento" && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const passo = e.shiftKey ? 8 : 1;
        const sel = state.selecao;
        const banda = state.schema.bandas.find((b) => b.id === sel.bandaId);
        const el = banda?.elementos.find((x) => x.id === sel.elementoId);
        if (!el) return;
        const patch =
          e.key === "ArrowLeft"
            ? { x: Math.max(0, el.x - passo) }
            : e.key === "ArrowRight"
              ? { x: el.x + passo }
              : e.key === "ArrowUp"
                ? { y: Math.max(0, el.y - passo) }
                : { y: el.y + passo };
        dispatch({ t: "updateElemento", bandaId: sel.bandaId, elementoId: sel.elementoId, patch, commit: true });
      } else if (state.selecao.tipo === "multi" && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const passo = e.shiftKey ? 8 : 1;
        const sel = state.selecao;
        const dx = e.key === "ArrowLeft" ? -passo : e.key === "ArrowRight" ? passo : 0;
        const dy = e.key === "ArrowUp" ? -passo : e.key === "ArrowDown" ? passo : 0;
        dispatch({ t: "moverMultiplos", bandaId: sel.bandaId, ids: sel.ids, dx, dy, commit: true });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.selecao, state.schema.bandas]);

  const bandasFaltantes = TIPOS_BANDA.filter(
    (t) => !state.schema.bandas.some((b) => b.tipo === t),
  );

  return (
    <div className="-m-4 flex h-[calc(100svh-4rem)] flex-col lg:-m-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        <Button variant="ghost" size="icon" render={<Link href="/documentos" aria-label="Voltar" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-56" />
        <Select value={tipo} onValueChange={(v) => setTipo((v as TipoDoc) ?? "relatorio")}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPOS_DOC.map((t) => (
              <SelectItem key={t.v} value={t.v}>
                {t.l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fonte || "__none"} onValueChange={(v) => setFonte(!v || v === "__none" ? "" : v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Fonte de dados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Sem fonte de dados</SelectItem>
            {fontesDados.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.label}
              </SelectItem>
            ))}
            {datasets.map((d) => (
              <SelectItem key={d.id} value={`dataset:${d.id}`}>
                Dataset · {d.nome}
              </SelectItem>
            ))}
            {/* Retrocompat: se a fonte atual não está nas listas acima (ex.: fonte
                sem permissão para este perfil, ou dataset removido), mostra-a para
                não perder o valor salvo ao reabrir o editor. */}
            {fonte &&
              fonte !== "__none" &&
              !fontesDados.some((f) => f.id === fonte) &&
              !datasets.some((d) => `dataset:${d.id}` === fonte) && (
                <SelectItem value={fonte}>
                  {FONTES.find((f) => f.id === fonte)?.label ?? fonte}
                </SelectItem>
              )}
          </SelectContent>
        </Select>

        {/* Alinhar / distribuir — só quando há multi-seleção (2+ elementos). */}
        {temMulti && (
          <div className="flex items-center gap-0.5 border-l pl-2">
            <BotaoIcone label="Alinhar à esquerda" onClick={() => alinhar("esquerda")}>
              <AlignStartVertical className="size-4" />
            </BotaoIcone>
            <BotaoIcone label="Centralizar horizontal" onClick={() => alinhar("centroH")}>
              <AlignCenterVertical className="size-4" />
            </BotaoIcone>
            <BotaoIcone label="Alinhar à direita" onClick={() => alinhar("direita")}>
              <AlignEndVertical className="size-4" />
            </BotaoIcone>
            <BotaoIcone label="Alinhar ao topo" onClick={() => alinhar("topo")}>
              <AlignStartHorizontal className="size-4" />
            </BotaoIcone>
            <BotaoIcone label="Centralizar vertical" onClick={() => alinhar("meio")}>
              <AlignCenterHorizontal className="size-4" />
            </BotaoIcone>
            <BotaoIcone label="Alinhar à base" onClick={() => alinhar("base")}>
              <AlignEndHorizontal className="size-4" />
            </BotaoIcone>
            <BotaoIcone
              label="Distribuir horizontalmente"
              disabled={selIds.length < 3}
              onClick={() => distribuir("horizontal")}
            >
              <AlignHorizontalSpaceAround className="size-4" />
            </BotaoIcone>
            <BotaoIcone
              label="Distribuir verticalmente"
              disabled={selIds.length < 3}
              onClick={() => distribuir("vertical")}
            >
              <AlignVerticalSpaceAround className="size-4" />
            </BotaoIcone>
          </div>
        )}

        {/* Blocos reutilizáveis. */}
        <div className="flex items-center gap-0.5 border-l pl-2">
          <SalvarBlocoDialog
            disabled={!temSelecaoElementos}
            quantidade={selIds.length}
            obterElementos={elementosSelecionados}
          />
          <InserirBlocoDialog blocos={blocos} onInserir={inserirBloco} />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Desfazer" disabled={state.past.length === 0} onClick={() => dispatch({ t: "undo" })}>
            <Undo2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Refazer" disabled={state.future.length === 0} onClick={() => dispatch({ t: "redo" })}>
            <Redo2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Diminuir zoom" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
            <ZoomOut className="size-4" />
          </Button>
          <span className="w-12 text-center font-mono text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" aria-label="Aumentar zoom" onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))}>
            <ZoomIn className="size-4" />
          </Button>

          <VariaveisDialog
            trigger={
              <Button variant="ghost" size="icon" aria-label="Variáveis disponíveis">
                <HelpCircle className="size-4" />
              </Button>
            }
          />

          <VersoesDialog modeloId={modeloId} versoes={versoes} />

          <Button variant="outline" size="sm" render={<Link href={`/documentos/${modeloId}/preview`} />}>
            <Eye className="size-4" /> Preview
          </Button>
          <Button size="sm" onClick={salvar} disabled={pending}>
            <Save className="size-4" /> {pending ? "Salvando…" : state.sujo ? "Salvar*" : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Paleta */}
        <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-card py-2">
          {PALETA.map((p) => (
            <Tooltip key={p.tipo}>
              <TooltipTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label={p.label} onClick={() => adicionar(p.tipo)}>
                    <p.icone className="size-4" />
                  </Button>
                }
              />
              <TooltipContent side="right">{p.label}</TooltipContent>
            </Tooltip>
          ))}
          {bandasFaltantes.length > 0 && (
            <div className="mt-auto">
              <Select value="" onValueChange={(v) => v && dispatch({ t: "addBanda", tipo: v as TipoBanda, id: novoId() })}>
                <SelectTrigger
                  className="size-9 justify-center border-0 p-0 [&>svg:last-child]:hidden"
                  aria-label="Adicionar banda"
                >
                  <Plus className="size-4" />
                </SelectTrigger>
                <SelectContent>
                  {bandasFaltantes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {BANDA_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </aside>

        <Canvas schema={state.schema} selecao={state.selecao} zoom={zoom} dispatch={dispatch} />

        <Propriedades
          schema={state.schema}
          selecao={state.selecao}
          fonte={fonte}
          fontesHabilitadas={fontesHabilitadas}
          fonteColunas={fonteColunas}
          dispatch={dispatch}
        />
      </div>
    </div>
  );
}

function VersoesDialog({ modeloId, versoes }: { modeloId: string; versoes: VersaoT[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function restaurar(versaoId: string) {
    start(async () => {
      const r = await restaurarVersao({ modeloId, versaoId });
      if (r.ok) {
        toast.success("Versão restaurada — recarregando.");
        router.refresh();
        // força recarga do editor com o schema restaurado
        window.location.reload();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Histórico de versões">
            <History className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Histórico de versões</DialogTitle>
          <DialogDescription>Cada salvar gera uma versão. Restaurar cria uma nova.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 divide-y overflow-y-auto text-sm">
          {versoes.length === 0 ? (
            <li>
              <EmptyState icon={History} title="Nenhuma versão ainda" />
            </li>
          ) : (
            versoes.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-mono font-semibold">v{v.numero}</span>{" "}
                  <span className="text-muted-foreground">
                    · {v.autor} · {new Date(v.data).toLocaleString("pt-BR")}
                  </span>
                </span>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => restaurar(v.id)}>
                  Restaurar
                </Button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Botão de toolbar com tooltip (ícone). Usado nos controles de alinhar/distribuir. */
function BotaoIcone({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>
            {children}
          </Button>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Dialog "Salvar como bloco": nome + checkbox de compartilhar. */
function SalvarBlocoDialog({
  disabled,
  quantidade,
  obterElementos,
}: {
  disabled: boolean;
  quantidade: number;
  obterElementos: () => Elemento[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [compartilhado, setCompartilhado] = useState(false);
  const [pending, start] = useTransition();

  function salvar() {
    const conteudo = obterElementos();
    if (conteudo.length === 0) {
      toast.error("Selecione ao menos um elemento.");
      return;
    }
    if (!nome.trim()) {
      toast.error("Informe o nome do bloco.");
      return;
    }
    start(async () => {
      const r = await salvarBloco({ nome: nome.trim(), conteudo, compartilhado });
      if (r.ok) {
        toast.success(`Bloco "${r.data.nome}" salvo.`);
        setOpen(false);
        setNome("");
        setCompartilhado(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Salvar seleção como bloco"
            title="Salvar seleção como bloco"
            disabled={disabled}
          >
            <BookmarkPlus className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Salvar como bloco</DialogTitle>
          <DialogDescription>
            {quantidade} elemento(s) selecionado(s) serão salvos na biblioteca de blocos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Nome do bloco</label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Cabeçalho padrão"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") salvar();
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={compartilhado}
              onChange={(e) => setCompartilhado(e.target.checked)}
            />
            Compartilhar com todos
          </label>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancelar</Button>} />
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar bloco"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog "Inserir bloco": lista os blocos disponíveis; escolher insere na banda. */
function InserirBlocoDialog({
  blocos,
  onInserir,
}: {
  blocos: BlocoListItem[];
  onInserir: (bloco: BlocoListItem) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function escolher(bloco: BlocoListItem) {
    onInserir(bloco);
    setOpen(false);
  }

  function remover(id: string) {
    start(async () => {
      const r = await excluirBloco({ id });
      if (r.ok) {
        toast.success("Bloco excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Inserir bloco" title="Inserir bloco">
            <Library className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inserir bloco</DialogTitle>
          <DialogDescription>
            Insere os elementos do bloco na banda selecionada (ou na primeira disponível).
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 divide-y overflow-y-auto text-sm">
          {blocos.length === 0 ? (
            <li>
              <EmptyState icon={Library} title="Nenhum bloco salvo ainda" />
            </li>
          ) : (
            blocos.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                <button
                  type="button"
                  className="flex flex-1 flex-col items-start text-left hover:underline"
                  onClick={() => escolher(b)}
                >
                  <span className="font-medium">{b.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {b.nElementos} elemento(s)
                    {b.compartilhado ? " · compartilhado" : ""}
                    {!b.ehDono ? " · de outro usuário" : ""}
                  </span>
                </button>
                {b.ehDono && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Excluir bloco"
                    disabled={pending}
                    onClick={() => remover(b.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
