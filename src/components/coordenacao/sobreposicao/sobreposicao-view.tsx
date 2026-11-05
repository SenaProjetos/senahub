"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, Loader2, Maximize } from "lucide-react";
import { atualizarCamada, definirBase, removerCamada } from "@/modules/coordenacao/sobreposicao/actions";
import {
  ACAO_ALINHAR,
  ACAO_DEFINIR_BASE,
  ACAO_REMOVER,
  ACAO_USAR_DWG,
  ACAO_USAR_PDF,
  itensDaCamada,
} from "@/modules/coordenacao/sobreposicao/acoes";
import type { CamadaDaCena, CenaSobreposicao } from "@/modules/coordenacao/sobreposicao/queries";
import { alinhamentoEfetivo } from "@/modules/coordenacao/sobreposicao/regras";
import { caixaAplicada } from "@/modules/coordenacao/sobreposicao/transformacao";
import { limparSeparadores, type AcaoItemAcao } from "@/components/ui/acoes";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAlturaRestante } from "@/lib/use-altura-restante";
import { AdicionarCamadaDialog, type DocumentoParaCamada } from "./adicionar-camada-dialog";
import { PainelCamadas, type AjusteCamada, type ModoGravar } from "./painel-camadas";
import { Palco, type CamadaNoPalco, type PalcoHandle } from "./palco";
import { colorir } from "./render-pdf";
import { useCamadasRenderizadas } from "./use-camadas-renderizadas";

export type SobreposicaoViewProps = {
  cena: CenaSobreposicao;
  documentos: DocumentoParaCamada[];
  sobreposicoes: { id: string; nome: string; camadas: number }[];
};

/** Pausa antes de gravar cor e olho (cliques seguidos viram uma escrita). */
const PAUSA_GRAVAR_MS = 400;

type Resultado = { ok: true } | { ok: false; error: string };

/** Base embaixo, depois a ordem do painel. */
function ordemDeDesenho(camadas: CamadaDaCena[]): CamadaDaCena[] {
  return [...camadas].sort((a, b) => Number(b.base) - Number(a.base) || a.ordem - b.ordem);
}

/** Ajustes locais que o servidor já tem deixam de valer (o dado novo da cena manda). */
function semOQueJaGravou(ajustes: Record<string, AjusteCamada>, camadas: CamadaDaCena[]): Record<string, AjusteCamada> {
  const out: Record<string, AjusteCamada> = {};
  for (const c of camadas) {
    const a = ajustes[c.id];
    if (!a) continue;
    const resto = Object.fromEntries(
      Object.entries(a).filter(([k, v]) => c[k as keyof AjusteCamada] !== v),
    ) as AjusteCamada;
    if (Object.keys(resto).length > 0) out[c.id] = resto;
  }
  return out;
}

export function SobreposicaoView({ cena, documentos }: SobreposicaoViewProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, start] = useTransition();
  const palcoRef = useRef<PalcoHandle>(null);
  const quadro = useAlturaRestante<HTMLDivElement>({ minimo: 360 });
  const [zoom, setZoom] = useState(100);
  const [gaveta, setGaveta] = useState(false);

  // Olho, cor, opacidade e página mudam na hora; a escrita vai depois (otimista).
  const [ajustes, setAjustes] = useState<Record<string, AjusteCamada>>({});
  useEffect(() => setAjustes((a) => semOQueJaGravou(a, cena.camadas)), [cena.camadas]);
  const pendentes = useRef(new Map<string, { ajuste: AjusteCamada; timer: ReturnType<typeof setTimeout> | null }>());

  const camadas = useMemo(
    () => ordemDeDesenho(cena.camadas.map((c) => ({ ...c, ...ajustes[c.id] }))),
    [cena.camadas, ajustes],
  );
  const estados = useCamadasRenderizadas(camadas);

  const gravar = useCallback(
    (camadaId: string) => {
      const p = pendentes.current.get(camadaId);
      if (!p) return;
      pendentes.current.delete(camadaId);
      if (p.timer) clearTimeout(p.timer);
      const ajuste = p.ajuste;
      void atualizarCamada({ camadaId, ...ajuste }).then((r) => {
        if (r.ok) return;
        toast.error(r.error);
        // Falhou: a tela volta ao que o servidor tem.
        setAjustes((a) => {
          const atual = { ...a[camadaId] };
          for (const k of Object.keys(ajuste) as (keyof AjusteCamada)[]) delete atual[k];
          return { ...a, [camadaId]: atual };
        });
      });
    },
    [],
  );

  const mudar = useCallback(
    (camadaId: string, ajuste: AjusteCamada, modo: ModoGravar) => {
      setAjustes((a) => ({ ...a, [camadaId]: { ...a[camadaId], ...ajuste } }));
      // Quem só vê pode ligar, desligar e esmaecer na própria tela; gravar é de quem gere.
      if (modo === "nao" || !cena.podeGerir) return;
      const p = pendentes.current.get(camadaId);
      if (p?.timer) clearTimeout(p.timer);
      pendentes.current.set(camadaId, { ajuste: { ...p?.ajuste, ...ajuste }, timer: null });
      if (modo === "agora") gravar(camadaId);
      else pendentes.current.get(camadaId)!.timer = setTimeout(() => gravar(camadaId), PAUSA_GRAVAR_MS);
    },
    [cena.podeGerir, gravar],
  );

  // Saindo da tela com escrita na fila: grava já.
  useEffect(() => {
    const fila = pendentes.current;
    return () => {
      for (const id of [...fila.keys()]) gravar(id);
    };
  }, [gravar]);

  function rodar(acao: () => Promise<Resultado>, sucesso: string) {
    start(async () => {
      const r = await acao();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(sucesso);
      router.refresh();
    });
  }

  // Task 7: o alinhamento liga aqui (ferramenta de alinhar a camada sobre a base).
  const aoAlinhar = useCallback((camadaId: string) => void camadaId, []);

  const itensDe = useCallback(
    (c: CamadaDaCena) =>
      // Task 7: "Alinhar" volta ao menu quando a ferramenta existir.
      limparSeparadores(
        itensDaCamada({
          podeGerir: cena.podeGerir,
          base: c.base,
          formato: c.formato,
          temPdf: c.pdf !== null,
          temDwg: c.dwg !== null,
          totalCamadas: cena.camadas.length,
        }).filter((i) => i.id !== ACAO_ALINHAR),
      ),
    [cena.podeGerir, cena.camadas.length],
  );

  async function aoEscolher(c: CamadaDaCena, item: AcaoItemAcao) {
    if (item.id === ACAO_DEFINIR_BASE) {
      rodar(() => definirBase({ camadaId: c.id }), "Camada definida como base.");
    } else if (item.id === ACAO_USAR_PDF) {
      rodar(() => atualizarCamada({ camadaId: c.id, formato: "pdf" }), "Camada em PDF.");
    } else if (item.id === ACAO_USAR_DWG) {
      rodar(() => atualizarCamada({ camadaId: c.id, formato: "dwg" }), "Camada em DWG.");
    } else if (item.id === ACAO_ALINHAR) {
      aoAlinhar(c.id);
    } else if (item.id === ACAO_REMOVER) {
      // Confirmar ANTES do startTransition.
      const ok = await confirm({
        title: item.confirmar?.titulo ?? "Remover esta camada?",
        description: item.confirmar?.descricao,
        confirmLabel: item.confirmar?.rotuloConfirmar ?? "Remover",
        variant: "destructive",
      });
      if (!ok) return;
      rodar(() => removerCamada({ camadaId: c.id }), "Camada removida.");
    }
  }

  // Mundo = caixa nativa da base passada pelo alinhamento dela; cada camada entra pelo seu.
  const { noPalco, caixaMundo } = useMemo(() => {
    const base = camadas.find((c) => c.base);
    const eBase = base ? estados[base.id] : undefined;
    const mundo =
      base && eBase?.tipo === "pronto"
        ? caixaAplicada(alinhamentoEfetivo(base, eBase.render.caixaNativa, eBase.render.caixaNativa), eBase.render.caixaNativa)
        : null;
    const lista: CamadaNoPalco[] = [];
    for (const c of camadas) {
      const e = estados[c.id];
      if (e?.tipo !== "pronto") continue;
      if (e.render.formato === "pdf") colorir(e.render, c.cor);
      const nativa = e.render.caixaNativa;
      lista.push({
        id: c.id,
        render: e.render,
        alinhamento: alinhamentoEfetivo(c, mundo ?? nativa, nativa),
        cor: c.cor,
        opacidade: c.opacidade,
        visivel: c.visivel,
      });
    }
    return { noPalco: lista, caixaMundo: mundo };
  }, [camadas, estados]);

  const disponiveis = useMemo(() => {
    const usados = new Set(cena.camadas.map((c) => c.documentoId));
    return documentos.filter((d) => !usados.has(d.documentoId));
  }, [cena.camadas, documentos]);

  if (cena.camadas.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Nenhuma camada nesta sobreposição"
        description={
          documentos.length === 0
            ? "Envie o PDF ou o DWG das disciplinas na aba Arquivos para montar a sobreposição."
            : cena.podeGerir
              ? "Comece pela base do pavimento, normalmente a arquitetura."
              : "A coordenação ainda não adicionou as plantas deste pavimento."
        }
        action={
          cena.podeGerir && documentos.length > 0 ? (
            <AdicionarCamadaDialog sobreposicaoId={cena.id} documentos={documentos} primeira />
          ) : undefined
        }
      />
    );
  }

  const painel = (
    <PainelCamadas
      sobreposicaoId={cena.id}
      podeGerir={cena.podeGerir}
      camadas={camadas}
      estados={estados}
      documentos={disponiveis}
      itensDe={itensDe}
      onAcao={aoEscolher}
      onMudar={mudar}
      onUsarPdf={(id) => rodar(() => atualizarCamada({ camadaId: id, formato: "pdf" }), "Camada em PDF.")}
    />
  );
  const carregando = noPalco.length === 0 && camadas.some((c) => estados[c.id]?.tipo === "carregando");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="md:hidden" onClick={() => setGaveta(true)}>
          <Layers className="size-4" />
          Camadas
        </Button>
        {/* Cortina e Cruzamentos entram na Task 9. */}
        <Tabs value="sobrepor">
          <TabsList>
            <TabsTrigger value="sobrepor">Sobrepor</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground" aria-label="Zoom">
            {zoom}%
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => palcoRef.current?.ajustar()}>
            <Maximize className="size-4" />
            Ajustar à tela
          </Button>
        </div>
      </div>

      <div
        ref={quadro.ref}
        style={quadro.style}
        className="grid gap-3 md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]"
      >
        <aside className="hidden min-h-0 overflow-y-auto rounded-lg border bg-card md:block" aria-label="Camadas">
          {painel}
        </aside>
        <div className="relative h-[65svh] min-h-0 overflow-hidden rounded-lg border md:h-auto">
          <Palco ref={palcoRef} key={cena.id} camadas={noPalco} caixaMundo={caixaMundo} onZoom={setZoom} />
          {carregando && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Carregando as plantas…
              </span>
            </div>
          )}
        </div>
      </div>

      <Sheet open={gaveta} onOpenChange={setGaveta}>
        <SheetContent side="bottom" className="max-h-[75svh] gap-0 overflow-y-auto rounded-t-2xl p-0 pt-9 pb-4">
          <SheetHeader className="sr-only">
            <SheetTitle>Camadas</SheetTitle>
          </SheetHeader>
          {painel}
        </SheetContent>
      </Sheet>
    </div>
  );
}
