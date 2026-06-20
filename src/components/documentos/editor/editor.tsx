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
} from "lucide-react";
import {
  novoElemento,
  novoId,
  TIPOS_BANDA,
  BANDA_LABEL,
  type DocSchema,
  type TipoBanda,
  type TipoElemento,
} from "@/modules/documentos/schema";
import { FONTES } from "@/modules/documentos/fontes-meta";
import type { FonteTipografica } from "@/modules/documentos/fontes-tipograficas";
import { salvarModelo, restaurarVersao } from "@/modules/documentos/actions";
import { editorReducer, type EditorState } from "./estado";
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
  DialogContent,
  DialogDescription,
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
  versoes,
}: {
  modeloId: string;
  nomeInicial: string;
  tipoInicial: TipoDoc;
  fonteInicial: string;
  schemaInicial: DocSchema;
  fontesHabilitadas: FonteTipografica[];
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
            {FONTES.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
