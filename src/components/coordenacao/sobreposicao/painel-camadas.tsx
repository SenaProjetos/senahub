"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import type { CamadaDaCena } from "@/modules/coordenacao/sobreposicao/queries";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdicionarCamadaDialog, type DocumentoParaCamada } from "./adicionar-camada-dialog";
import type { EstadoRender } from "./use-camadas-renderizadas";

/** Campos que a tela muda na hora (otimista) antes de gravar. */
export type AjusteCamada = Partial<Pick<CamadaDaCena, "visivel" | "opacidade" | "cor" | "pagina">>;

/** `"nao"` = só na tela (arrastando); `"agora"` = grava já; `"depois"` = grava após uma pausa. */
export type ModoGravar = "nao" | "agora" | "depois";

type Props = {
  sobreposicaoId: string;
  podeGerir: boolean;
  /** Já com os ajustes locais, na ordem de desenho (base primeiro). */
  camadas: CamadaDaCena[];
  estados: Record<string, EstadoRender>;
  documentos: DocumentoParaCamada[];
  itensDe: (c: CamadaDaCena) => AcaoItem[];
  onAcao: (c: CamadaDaCena, item: AcaoItemAcao) => void;
  onMudar: (camadaId: string, ajuste: AjusteCamada, modo: ModoGravar) => void;
  onUsarPdf: (camadaId: string) => void;
  /** Camada em alinhamento agora (o painel mostra "Alinhando…" no lugar dos botões). */
  alinhandoId: string | null;
  onAlinhar: (camadaId: string) => void;
  /** "Está certo": o alinhamento da revisão anterior vale para o arquivo vigente. */
  onConfirmar: (camadaId: string) => void;
};

const TEXTO_STATUS_DWG = {
  fila: "Convertendo o DWG…",
  processando: "Convertendo o DWG…",
  erro: "Falha na conversão do DWG",
  sem_conversao: "DWG ainda não convertido",
} as const;

/**
 * Avisos da camada, na ordem em que importam; `usarPdf` = oferecer o botão "Usar o PDF";
 * `alinhamento` = oferecer "Alinhar" (camada sem alinhamento) ou "Está certo" + "Alinhar" (revisão nova).
 */
function avisosDa(
  c: CamadaDaCena,
  estado: EstadoRender | undefined,
): { textos: string[]; usarPdf: boolean; alinhamento: "alinhar" | "conferir" | null } {
  const textos: string[] = [];
  let usarPdf = false;
  let alinhamento: "alinhar" | "conferir" | null = null;
  const arquivo = c.formato === "pdf" ? c.pdf : c.dwg;
  if (!arquivo) {
    textos.push(c.formato === "pdf" ? "Sem arquivo PDF vigente" : "Sem arquivo DWG vigente");
    usarPdf = c.formato === "dwg" && c.pdf !== null;
  } else if (c.dwg && c.formato === "dwg" && c.dwg.status !== "concluido") {
    textos.push(TEXTO_STATUS_DWG[c.dwg.status]);
    usarPdf = c.pdf !== null;
  }
  if (estado?.tipo === "erro") textos.push(estado.mensagem);

  const al = c.alinhamentos[c.formato];
  if (!al && !c.base) {
    textos.push("Não alinhada");
    alinhamento = "alinhar";
  } else if (al?.estado === "revisao_anterior") {
    textos.push(al.revisaoConferida ? `Alinhamento da revisão anterior (${al.revisaoConferida})` : "Alinhamento da revisão anterior");
    alinhamento = "conferir";
  }
  if (estado?.tipo === "pronto" && estado.render.avisoArquitetura) {
    textos.push("Arquitetura de fundo não encontrada (layer SENA_ARQ)");
  }
  return { textos, usarPdf, alinhamento };
}

function rotuloArquivo(c: CamadaDaCena): string {
  const arquivo = c.formato === "pdf" ? c.pdf : c.dwg;
  const partes = [c.formato.toUpperCase()];
  if (arquivo) {
    partes.push(arquivo.revisao);
    if (arquivo.estado) partes.push(arquivo.estado);
  }
  return partes.join(" · ");
}

function LinhaCamada({
  camada: c,
  estado,
  podeGerir,
  itens,
  onAcao,
  onMudar,
  onUsarPdf,
  alinhando,
  onAlinhar,
  onConfirmar,
}: {
  camada: CamadaDaCena;
  estado: EstadoRender | undefined;
  podeGerir: boolean;
  itens: AcaoItem[];
  onAcao: Props["onAcao"];
  onMudar: Props["onMudar"];
  onUsarPdf: Props["onUsarPdf"];
  alinhando: boolean;
  onAlinhar: Props["onAlinhar"];
  onConfirmar: Props["onConfirmar"];
}) {
  const nome = `${c.disciplina} · ${c.titulo}`;
  const { textos, usarPdf, alinhamento } = avisosDa(c, estado);
  const desenhada = estado?.tipo === "pronto";
  const numPaginas = estado?.tipo === "pronto" && estado.render.formato === "pdf" ? estado.render.numPaginas : 1;

  return (
    <LinhaComMenu
      itens={itens}
      onSelect={(item) => onAcao(c, item)}
      render={<li className="space-y-2 px-3 py-2.5 data-[popup-open]:bg-muted/50" />}
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-pressed={c.visivel}
          aria-label={c.visivel ? `Ocultar a camada ${nome}` : `Mostrar a camada ${nome}`}
          onClick={() => onMudar(c.id, { visivel: !c.visivel }, "depois")}
        >
          {c.visivel ? <Eye className="size-4" /> : <EyeOff className="size-4 text-muted-foreground" />}
        </Button>
        {podeGerir ? (
          <input
            type="color"
            value={c.cor}
            onChange={(e) => onMudar(c.id, { cor: e.target.value }, "depois")}
            aria-label={`Cor da camada ${nome}`}
            className="size-6 shrink-0 cursor-pointer rounded border bg-transparent p-0"
          />
        ) : (
          <span className="size-4 shrink-0 rounded-full border" style={{ backgroundColor: c.cor }} aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={nome}>
            {c.disciplina}
          </span>
          <span className="block truncate text-xs text-muted-foreground" title={c.titulo}>
            {c.titulo}
          </span>
        </span>
        {c.base && <Badge className="shrink-0">Base</Badge>}
        <BotaoAcoes itens={itens} onSelect={(item) => onAcao(c, item)} rotulo={`Ações da camada ${nome}`} className="size-7" />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-9 text-xs text-muted-foreground">
        <span>{rotuloArquivo(c)}</span>
        {estado?.tipo === "carregando" && <Loader2 className="size-3 animate-spin" aria-label="Carregando" />}
      </div>

      <label className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
        <span className="sr-only">Opacidade da camada {nome}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={c.opacidade}
          onChange={(e) => onMudar(c.id, { opacidade: Number(e.target.value) }, "nao")}
          onPointerUp={(e) => onMudar(c.id, { opacidade: Number(e.currentTarget.value) }, "agora")}
          onKeyUp={(e) => onMudar(c.id, { opacidade: Number(e.currentTarget.value) }, "agora")}
          className="min-w-0 flex-1 accent-primary"
        />
        <span className="w-9 shrink-0 text-right tabular-nums">{c.opacidade}%</span>
      </label>

      {c.formato === "pdf" && numPaginas > 1 && (
        <div className="pl-9">
          <Select value={String(c.pagina)} onValueChange={(v) => v && onMudar(c.id, { pagina: Number(v) }, "agora")}>
            <SelectTrigger size="sm" className="w-32" aria-label={`Página do PDF da camada ${nome}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: numPaginas }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  Página {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {alinhando ? (
        <p className="pl-9 text-xs font-medium text-primary">Alinhando…</p>
      ) : (
        (textos.length > 0 || usarPdf) && (
          <div className="space-y-1 pl-9">
            {textos.map((t) => (
              <p key={t} className="text-xs text-warning-text">
                {t}
              </p>
            ))}
            {podeGerir && (usarPdf || (alinhamento && desenhada)) && (
              <div className="flex flex-wrap gap-1.5">
                {usarPdf && (
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => onUsarPdf(c.id)}>
                    Usar o PDF
                  </Button>
                )}
                {alinhamento === "conferir" && desenhada && (
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => onConfirmar(c.id)}>
                    Está certo
                  </Button>
                )}
                {alinhamento && desenhada && (
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => onAlinhar(c.id)}>
                    Alinhar
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      )}
    </LinhaComMenu>
  );
}

/** Painel lateral (gaveta no celular): uma linha por camada, base no topo, e "+ Adicionar disciplina". */
export function PainelCamadas({
  sobreposicaoId,
  podeGerir,
  camadas,
  estados,
  documentos,
  itensDe,
  onAcao,
  onMudar,
  onUsarPdf,
  alinhandoId,
  onAlinhar,
  onConfirmar,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
        <h3 className="text-sm font-semibold">Camadas</h3>
        {podeGerir && <AdicionarCamadaDialog sobreposicaoId={sobreposicaoId} documentos={documentos} primeira={camadas.length === 0} />}
      </div>
      <ul className="divide-y">
        {camadas.map((c) => (
          <LinhaCamada
            key={c.id}
            camada={c}
            estado={estados[c.id]}
            podeGerir={podeGerir}
            itens={itensDe(c)}
            onAcao={onAcao}
            onMudar={onMudar}
            onUsarPdf={onUsarPdf}
            alinhando={alinhandoId === c.id}
            onAlinhar={onAlinhar}
            onConfirmar={onConfirmar}
          />
        ))}
      </ul>
    </div>
  );
}
