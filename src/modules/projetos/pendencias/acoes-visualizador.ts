import {
  ArrowUpRight,
  Check,
  Cloud,
  Copy,
  DraftingCompass,
  Expand,
  Hand,
  MapPin,
  Maximize2,
  Minimize,
  PenLine,
  RotateCw,
  Ruler,
  Search,
  Square,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { MARCACAO_LABEL, TIPOS_MARCACAO, type TipoMarcacao } from "./marcacao";

/**
 * Ferramentas do visualizador de pranchas — **puro**. A barra acima da prancha e o menu de
 * contexto da prancha (botão direito / toque longo) leem daqui o rótulo, o ícone e o atalho de
 * cada ferramenta, então os dois nunca divergem. O menu é o atalho; a barra é o caminho que
 * também serve ao teclado (ADR-0002, regra 2).
 */

export const ACAO_APONTAR_AQUI = "apontar-aqui";
export const ACAO_COPIAR_TEXTO = "copiar-texto";
export const ACAO_ESBOCO_CONCLUIR = "esboco-concluir";
export const ACAO_ESBOCO_DESFAZER = "esboco-desfazer";
export const ACAO_ESBOCO_DESCARTAR = "esboco-descartar";
export const ACAO_ZOOM_MAIS = "zoom-mais";
export const ACAO_ZOOM_MENOS = "zoom-menos";
export const ACAO_AJUSTAR = "ajustar-largura";
export const ACAO_GIRAR = "girar";
export const ACAO_TELA_CHEIA = "tela-cheia";
export const ACAO_BUSCAR = "buscar";
export const ACAO_CALIBRAR = "calibrar";
/** "Navegar": sai do modo apontar — arrastar volta a mover a prancha. */
export const ACAO_NAVEGAR = "navegar";
/** Prefixo das ferramentas de marcação: `ferramenta:ponto`, `ferramenta:medida`… */
export const PREFIXO_FERRAMENTA = "ferramenta:";

export function ferramentaDoItem(id: string): TipoMarcacao | null {
  if (!id.startsWith(PREFIXO_FERRAMENTA)) return null;
  const t = id.slice(PREFIXO_FERRAMENTA.length);
  return (TIPOS_MARCACAO as readonly string[]).includes(t) ? (t as TipoMarcacao) : null;
}

/** Ícone e tecla de cada ferramenta de marcação — a mesma ordem dos atalhos 1 a 6. */
export const FERRAMENTA_META: Record<TipoMarcacao, { icone: LucideIcon; atalho: string; dica: string }> = {
  ponto: { icone: MapPin, atalho: "1", dica: "Clique na prancha onde está a pendência." },
  retangulo: { icone: Square, atalho: "2", dica: "Arraste para marcar uma área retangular." },
  seta: { icone: ArrowUpRight, atalho: "3", dica: "Arraste da origem até o ponto indicado." },
  nuvem: { icone: Cloud, atalho: "4", dica: "Arraste para circular a área revisada com uma nuvem." },
  medida: { icone: Ruler, atalho: "5", dica: "Arraste, ou clique no início e no fim, para medir. Vale várias medidas por apontamento." },
  livre: { icone: PenLine, atalho: "6", dica: "Desenhe à mão livre, com quantos traços quiser." },
};

export const NAVEGAR_META = {
  rotulo: "Navegar",
  icone: Hand,
  atalho: "Esc",
  dica: "Arraste para mover a prancha. Sai do modo apontar.",
} as const;

export type EstadoVisualizador = {
  podeApontar: boolean;
  modoApontar: boolean;
  ferramenta: TipoMarcacao;
  zoom: number;
  zoomMin: number;
  zoomMax: number;
  emTelaCheia: boolean;
  /** Página sob o cursor quando o menu abriu (`null` = fora de uma página). */
  pagina: number | null;
  /** Há texto da prancha selecionado — o menu próprio repõe o "Copiar" do nativo. */
  temTextoSelecionado: boolean;
  /** Rabisco/medidas em andamento. */
  esboco: { tipo: "livre" | "medida" } | null;
};

export function itensDoVisualizador(e: EstadoVisualizador): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [];
  if (e.esboco) {
    const nome = e.esboco.tipo === "livre" ? "rabisco" : "medidas";
    itens.push(
      { tipo: "acao", id: ACAO_ESBOCO_CONCLUIR, rotulo: "Concluir e criar o apontamento", icone: Check, atalho: "Enter" },
      {
        tipo: "acao",
        id: ACAO_ESBOCO_DESFAZER,
        rotulo: e.esboco.tipo === "livre" ? "Desfazer o último traço" : "Desfazer a última medida",
        icone: Undo2,
        atalho: "Ctrl+Z",
      },
      { tipo: "acao", id: ACAO_ESBOCO_DESCARTAR, rotulo: `Descartar ${nome}`, icone: X },
      { tipo: "separador", id: "sep-esboco" },
    );
  }
  if (e.podeApontar && e.pagina != null && !e.esboco) {
    itens.push({ tipo: "acao", id: ACAO_APONTAR_AQUI, rotulo: "Novo apontamento aqui", icone: MapPin });
  }
  if (e.temTextoSelecionado) {
    itens.push({ tipo: "acao", id: ACAO_COPIAR_TEXTO, rotulo: "Copiar texto", icone: Copy, atalho: "Ctrl+C" });
  }
  itens.push(
    { tipo: "separador", id: "sep-zoom" },
    {
      tipo: "acao",
      id: ACAO_ZOOM_MAIS,
      rotulo: "Aumentar zoom",
      icone: ZoomIn,
      desabilitado: e.zoom >= e.zoomMax ? "Já está no zoom máximo." : undefined,
    },
    {
      tipo: "acao",
      id: ACAO_ZOOM_MENOS,
      rotulo: "Diminuir zoom",
      icone: ZoomOut,
      desabilitado: e.zoom <= e.zoomMin ? "Já está no zoom mínimo." : undefined,
    },
    { tipo: "acao", id: ACAO_AJUSTAR, rotulo: "Ajustar à largura", icone: Maximize2 },
    { tipo: "acao", id: ACAO_GIRAR, rotulo: "Girar 90°", icone: RotateCw },
    {
      tipo: "acao",
      id: ACAO_TELA_CHEIA,
      rotulo: e.emTelaCheia ? "Sair da tela cheia" : "Tela cheia",
      icone: e.emTelaCheia ? Minimize : Expand,
    },
    { tipo: "acao", id: ACAO_BUSCAR, rotulo: "Buscar no documento", icone: Search, atalho: "Ctrl+F" },
  );
  if (e.podeApontar) {
    itens.push(
      { tipo: "separador", id: "sep-ferramentas" },
      {
        tipo: "acao",
        id: ACAO_NAVEGAR,
        rotulo: NAVEGAR_META.rotulo,
        icone: NAVEGAR_META.icone,
        marcado: !e.modoApontar,
        atalho: NAVEGAR_META.atalho,
      },
      ...TIPOS_MARCACAO.map(
        (t): AcaoItem => ({
          tipo: "acao",
          id: `${PREFIXO_FERRAMENTA}${t}`,
          rotulo: MARCACAO_LABEL[t],
          icone: FERRAMENTA_META[t].icone,
          marcado: e.modoApontar && e.ferramenta === t,
          atalho: FERRAMENTA_META[t].atalho,
        }),
      ),
    );
    if (e.pagina != null) {
      itens.push({ tipo: "acao", id: ACAO_CALIBRAR, rotulo: `Escala da página ${e.pagina}…`, icone: DraftingCompass });
    }
  }
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
