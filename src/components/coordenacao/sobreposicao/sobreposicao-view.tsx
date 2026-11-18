"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crosshair, Layers, Loader2, Maximize } from "lucide-react";
import {
  atualizarCamada,
  confirmarAlinhamento,
  definirBase,
  removerCamada,
  salvarAlinhamento,
} from "@/modules/coordenacao/sobreposicao/actions";
import {
  ACAO_ALINHAR,
  ACAO_DEFINIR_BASE,
  ACAO_REMOVER,
  ACAO_USAR_DWG,
  ACAO_USAR_PDF,
  MOTIVO_SEM_DESENHO,
  itensDaCamada,
} from "@/modules/coordenacao/sobreposicao/acoes";
import type { CamadaDaCena, CenaSobreposicao } from "@/modules/coordenacao/sobreposicao/queries";
import { COR_ARQUITETURA_ALINHANDO, alinhamentoEfetivo, type Formato } from "@/modules/coordenacao/sobreposicao/regras";
import {
  clicar,
  definirCampos,
  deslocar,
  desfazer,
  iniciarSessao,
  limparCliques,
  mudou,
  passoDaSeta,
  trocarModo,
  type SessaoAlinhamento,
} from "@/modules/coordenacao/sobreposicao/sessao-alinhamento";
import { caixaAplicada, type Alinhamento, type Caixa, type Ponto } from "@/modules/coordenacao/sobreposicao/transformacao";
import { limparSeparadores, type AcaoItemAcao } from "@/components/ui/acoes";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAlturaRestante } from "@/lib/use-altura-restante";
import { AdicionarCamadaDialog, type DocumentoParaCamada } from "./adicionar-camada-dialog";
import { FerramentaAlinhar, desenharMarcadores } from "./ferramenta-alinhar";
import { PainelCamadas, type AjusteCamada, type ModoGravar } from "./painel-camadas";
import { Palco, type CamadaNoPalco, type PalcoHandle, type VistaPalco } from "./palco";
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

/** Tecla digitada num campo (ou num diálogo/menu aberto) não é atalho do alinhamento. */
function teclaDeCampo(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable) return true;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName)) return true;
  return alvo.closest("[role=dialog],[role=menu],[role=listbox]") !== null;
}

const chaveAlinhamento = (camadaId: string, formato: Formato) => `${camadaId}:${formato}`;

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
  const [pendente, start] = useTransition();
  const palcoRef = useRef<PalcoHandle>(null);
  const quadro = useAlturaRestante<HTMLDivElement>({ minimo: 360 });
  const [zoom, setZoom] = useState(100);
  const [gaveta, setGaveta] = useState(false);

  // Olho, cor, opacidade e página mudam na hora; a escrita vai depois (otimista).
  const [ajustes, setAjustes] = useState<Record<string, AjusteCamada>>({});
  useEffect(() => setAjustes((a) => semOQueJaGravou(a, cena.camadas)), [cena.camadas]);
  const pendentes = useRef(new Map<string, { ajuste: AjusteCamada; timer: ReturnType<typeof setTimeout> | null }>());

  // Alinhamento de UMA camada em andamento; nada vai ao banco até "Salvar alinhamento".
  const [sessao, setSessao] = useState<SessaoAlinhamento | null>(null);
  // O que acabou de ser salvo vale até a cena nova chegar (sem a camada piscar no lugar antigo).
  const [recemSalvos, setRecemSalvos] = useState<Record<string, Alinhamento>>({});
  useEffect(() => setRecemSalvos({}), [cena.camadas]);

  const camadas = useMemo(
    () =>
      ordemDeDesenho(
        cena.camadas.map((c) => ({
          ...c,
          ...ajustes[c.id],
          // A camada que está sendo alinhada fica sempre à vista.
          ...(sessao?.camadaId === c.id ? { visivel: true } : {}),
        })),
      ),
    [cena.camadas, ajustes, sessao?.camadaId],
  );
  const estados = useCamadasRenderizadas(camadas, sessao?.camadaId ?? null);

  // A camada sumiu ou trocou de formato no meio do alinhamento: a sessão não vale mais.
  useEffect(() => {
    if (!sessao) return;
    const c = camadas.find((x) => x.id === sessao.camadaId);
    if (!c || c.formato !== sessao.formato) setSessao(null);
  }, [camadas, sessao]);

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

  const itensDe = useCallback(
    (c: CamadaDaCena) =>
      limparSeparadores(
        itensDaCamada({
          podeGerir: cena.podeGerir,
          base: c.base,
          formato: c.formato,
          temPdf: c.pdf !== null,
          temDwg: c.dwg !== null,
          totalCamadas: cena.camadas.length,
          semDesenho: estados[c.id]?.tipo !== "pronto",
        }),
      ),
    [cena.podeGerir, cena.camadas.length, estados],
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

  // Mundo = caixa nativa da base passada pelo alinhamento SALVO dela (alinhar a base não move o mundo);
  // cada camada entra pelo seu, e a que está sendo alinhada pelo da sessão.
  const { noPalco, caixaMundo } = useMemo(() => {
    const salvoOuEfetivo = (c: CamadaDaCena, mundo: Caixa, nativa: Caixa) =>
      recemSalvos[chaveAlinhamento(c.id, c.formato)] ?? alinhamentoEfetivo(c, mundo, nativa);
    const base = camadas.find((c) => c.base);
    const eBase = base ? estados[base.id] : undefined;
    const mundo =
      base && eBase?.tipo === "pronto"
        ? caixaAplicada(salvoOuEfetivo(base, eBase.render.caixaNativa, eBase.render.caixaNativa), eBase.render.caixaNativa)
        : null;
    const lista: CamadaNoPalco[] = [];
    for (const c of camadas) {
      const e = estados[c.id];
      if (e?.tipo !== "pronto") continue;
      if (e.render.formato === "pdf") colorir(e.render, c.cor);
      const nativa = e.render.caixaNativa;
      const alinhando = sessao !== null && sessao.camadaId === c.id;
      lista.push({
        id: c.id,
        render: e.render,
        alinhamento: alinhando ? sessao.atual : salvoOuEfetivo(c, mundo ?? nativa, nativa),
        cor: c.cor,
        opacidade: c.opacidade,
        visivel: c.visivel,
        ...(alinhando ? { corArquitetura: COR_ARQUITETURA_ALINHANDO } : {}),
      });
    }
    return { noPalco: lista, caixaMundo: mundo };
  }, [camadas, estados, sessao, recemSalvos]);

  const camadaAlinhando = sessao ? (camadas.find((c) => c.id === sessao.camadaId) ?? null) : null;

  function aoAlinhar(camadaId: string) {
    const c = camadas.find((x) => x.id === camadaId);
    const noP = noPalco.find((x) => x.id === camadaId);
    if (!c || !noP || estados[camadaId]?.tipo !== "pronto") {
      toast.error(MOTIVO_SEM_DESENHO);
      return;
    }
    setGaveta(false);
    setSessao(
      iniciarSessao({
        camadaId,
        formato: c.formato,
        versaoLida: c.alinhamentos[c.formato]?.versao ?? null,
        alinhamento: noP.alinhamento,
        ehBase: c.base,
      }),
    );
  }

  async function cancelarAlinhamento() {
    if (!sessao) return;
    if (mudou(sessao)) {
      const ok = await confirm({
        title: "Descartar o alinhamento?",
        description: "A camada volta para onde estava antes de você começar a alinhar.",
        confirmLabel: "Descartar",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setSessao(null);
  }

  function salvarSessao() {
    if (!sessao) return;
    const { camadaId, formato, atual, versaoLida } = sessao;
    start(async () => {
      const r = await salvarAlinhamento({ camadaId, formato, alinhamento: atual, versaoLida });
      if (!r.ok) {
        // A sessão continua: a pessoa decide entre recarregar e tentar de novo.
        toast.error(r.error);
        return;
      }
      setRecemSalvos((a) => ({ ...a, [chaveAlinhamento(camadaId, formato)]: atual }));
      setSessao(null);
      toast.success("Alinhamento salvo.");
      router.refresh();
    });
  }

  function confirmarCamada(camadaId: string) {
    const c = camadas.find((x) => x.id === camadaId);
    const al = c?.alinhamentos[c.formato];
    if (!c || !al) return;
    rodar(() => confirmarAlinhamento({ camadaId, formato: c.formato, versaoLida: al.versao }), "Alinhamento conferido.");
  }

  // Atalhos do alinhamento: setas deslocam, Ctrl+Z desfaz, Esc descarta os cliques do par.
  const emSessao = sessao !== null;
  useEffect(() => {
    if (!emSessao) return;
    function aoTeclar(ev: KeyboardEvent) {
      if (teclaDeCampo(ev.target)) return;
      if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        setSessao((s) => s && desfazer(s));
        return;
      }
      if (ev.key === "Escape") {
        setSessao((s) => s && limparCliques(s));
        return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const d = passoDaSeta(ev.key, ev.shiftKey, palcoRef.current?.escalaVista() ?? 1);
      if (!d) return;
      ev.preventDefault();
      setSessao((s) => s && deslocar(s, d, true));
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [emSessao]);

  const corAlinhando = camadaAlinhando?.cor ?? "";
  const desenharPorCima = useCallback(
    (ctx: CanvasRenderingContext2D, vista: VistaPalco) => {
      if (sessao && sessao.cliques.length > 0) desenharMarcadores(ctx, vista, sessao, corAlinhando);
    },
    [sessao, corAlinhando],
  );

  const aoPontoMundo = useMemo(() => {
    if (!sessao || sessao.modo === "ajuste") return undefined;
    return (p: Ponto) => {
      const r = clicar(sessao, p);
      setSessao(r.sessao);
      if (r.erro) toast.error(r.erro);
    };
  }, [sessao]);

  const modoSessao = sessao?.modo;
  const aoArrastarCamada = useMemo(() => {
    if (modoSessao !== "ajuste") return undefined;
    return (d: Ponto, inicio: boolean) => setSessao((s) => s && deslocar(s, d, inicio));
  }, [modoSessao]);

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
      alinhandoId={sessao?.camadaId ?? null}
      onAlinhar={aoAlinhar}
      onConfirmar={confirmarCamada}
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {cena.podeGerir && !sessao && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" size="sm" variant="outline">
                    <Crosshair className="size-4" />
                    Alinhar
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-auto min-w-56">
                {camadas.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    disabled={estados[c.id]?.tipo !== "pronto"}
                    onClick={() => aoAlinhar(c.id)}
                  >
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.cor }} aria-hidden />
                    <span className="truncate">
                      {c.disciplina}
                      {c.base ? " (base)" : ""}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className="text-xs tabular-nums text-muted-foreground" aria-label="Zoom">
            {zoom}%
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => palcoRef.current?.ajustar()}>
            <Maximize className="size-4" />
            Ajustar à tela
          </Button>
        </div>
      </div>

      {sessao && camadaAlinhando && (
        <FerramentaAlinhar
          sessao={sessao}
          nome={`${camadaAlinhando.disciplina} · ${camadaAlinhando.titulo}`}
          salvando={pendente}
          onModo={(m) => setSessao((s) => s && trocarModo(s, m))}
          onCampos={(campos) => {
            const r = definirCampos(sessao, campos);
            setSessao(r.sessao);
            if (r.erro) toast.error(r.erro);
          }}
          onDesfazer={() => setSessao((s) => s && desfazer(s))}
          onCancelar={() => void cancelarAlinhamento()}
          onSalvar={salvarSessao}
        />
      )}

      <div
        ref={quadro.ref}
        style={quadro.style}
        className="grid gap-3 md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]"
      >
        <aside className="hidden min-h-0 overflow-y-auto rounded-lg border bg-card md:block" aria-label="Camadas">
          {painel}
        </aside>
        <div className="relative h-[65svh] min-h-0 overflow-hidden rounded-lg border md:h-auto">
          <Palco
            ref={palcoRef}
            key={cena.id}
            camadas={noPalco}
            caixaMundo={caixaMundo}
            onZoom={setZoom}
            onPontoMundo={aoPontoMundo}
            arrastarCamada={aoArrastarCamada}
            sobreposto={desenharPorCima}
            className={sessao ? (sessao.modo === "ajuste" ? "cursor-move" : "cursor-crosshair") : undefined}
          />
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
