"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Box, Info, Maximize, RotateCw, SlidersHorizontal } from "lucide-react";
import type { ModeloDoPortal } from "@/modules/portal/modelo3d/queries";
import {
  gruposDePavimento,
  unirPavimentos,
  visibilidadeDoPortal,
  type PavimentoDoModelo,
} from "@/modules/portal/modelo3d/regras";
import type { SelecaoInfo, ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import { VISTAS_PADRAO } from "@/modules/coordenacao/viewer/vistas";
import { useAlturaRestante } from "@/lib/use-altura-restante";
import { PainelPropriedades } from "@/components/coordenacao/painel-propriedades";
import { PainelModelo, type CorteHorizontal, type EstadoNaCena } from "@/components/portal/modelo3d/painel-modelo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

// O stack 3D (three + @thatopen/fragments) só baixa no navegador, ao abrir esta tela.
const Viewer3D = dynamic(() => import("@/components/coordenacao/viewer-3d"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

type DadosDoModelo = { pavimentos: PavimentoDoModelo[]; todosIds: number[]; pavimentoPorLocalId: Map<number, string | null> };

/** Abre um modelo na cena e lê o que o painel precisa dele: pavimentos (com piso pelas caixas) e todos os elementos. */
async function abrirNaCena(engine: ViewerEngine, m: ModeloDoPortal): Promise<DadosDoModelo> {
  await engine.carregarModelo(m.modeloId, m.url as string);
  const indice = await engine.indiceDoModelo(m.modeloId);
  const pavimentos: PavimentoDoModelo[] = [];
  for (const g of gruposDePavimento(indice)) {
    const pisoY = await engine.pisoDoPavimento(m.modeloId, g.localIds);
    pavimentos.push({ modeloId: m.modeloId, nome: g.nome, pisoY, localIds: g.localIds });
  }
  return {
    pavimentos,
    todosIds: indice.map((e) => e.localId),
    pavimentoPorLocalId: new Map(indice.map((e) => [e.localId, e.pavimentoNome])),
  };
}

/** O motivo da falha (vindo da rota), quando ele diz mais que a frase padrão. */
function estadoFalha(estado: EstadoNaCena | undefined): string | null {
  if (estado?.tipo !== "falhou" || estado.erro === "Não foi possível abrir o modelo.") return null;
  return estado.erro;
}

function mensagemDeErro(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Não foi possível abrir o modelo.";
}

/**
 * Visualizador 3D do portal do cliente (spec 2026-11-20, "Explorar"): carrega todos os modelos prontos juntos, com
 * liga/desliga por modelo, pavimentos unidos por nome, corte horizontal, propriedades do elemento clicado, enquadrar e
 * vistas padrão. Desligar um modelo só o esconde (fica na memória, religar é instantâneo).
 */
export function VisualizadorModelo({
  modelos,
  foco = null,
}: {
  projetoId: string;
  modelos: ModeloDoPortal[];
  /** `?modelo=` da URL: o modelo servido (ou a origem nas Entregas) que abre em destaque. */
  foco?: string | null;
}) {
  const quadro = useAlturaRestante<HTMLDivElement>({ minimo: 480 });
  const [engine, setEngine] = useState<ViewerEngine | null>(null);
  const [estados, setEstados] = useState<Map<string, EstadoNaCena>>(new Map());
  const [dados, setDados] = useState<Map<string, DadosDoModelo>>(new Map());
  const [desligados, setDesligados] = useState<Set<string>>(new Set());
  const [pavimentoSel, setPavimentoSel] = useState<string | null>(null);
  const [corte, setCorte] = useState<CorteHorizontal>({ ativo: false, posicao: 0.5 });
  const [faixaY, setFaixaY] = useState<{ min: number; max: number } | null>(null);
  const [selecao, setSelecao] = useState<SelecaoInfo | null>(null);
  const [folhaAberta, setFolhaAberta] = useState(false);

  const prontos = useMemo(() => modelos.filter((m) => m.situacao === "pronto" && m.url), [modelos]);
  const focoInicial = useMemo(
    () => (foco ? (prontos.find((m) => m.modeloId === foco || m.origemUploadId === foco)?.modeloId ?? null) : null),
    [foco, prontos],
  );
  // Destaque só faz sentido com mais de um modelo na tela.
  const [destaque, setDestaque] = useState<string | null>(prontos.length > 1 ? focoInicial : null);

  const mudarEstado = useCallback((modeloId: string, estado: EstadoNaCena) => {
    setEstados((atual) => new Map(atual).set(modeloId, estado));
  }, []);

  const abrir = useCallback(
    async (eng: ViewerEngine, m: ModeloDoPortal, cancelado: () => boolean) => {
      mudarEstado(m.modeloId, { tipo: "carregando" });
      try {
        const d = await abrirNaCena(eng, m);
        if (cancelado()) return;
        setDados((atual) => new Map(atual).set(m.modeloId, d));
        mudarEstado(m.modeloId, { tipo: "carregado" });
      } catch (e) {
        if (cancelado()) return;
        mudarEstado(m.modeloId, { tipo: "falhou", erro: mensagemDeErro(e) });
      }
    },
    [mudarEstado],
  );

  // Carrega os prontos um de cada vez (o worker do fragments é um só), o modelo em foco primeiro.
  useEffect(() => {
    if (!engine) return;
    let cancelado = false;
    const ordem = focoInicial
      ? [...prontos.filter((m) => m.modeloId === focoInicial), ...prontos.filter((m) => m.modeloId !== focoInicial)]
      : prontos;
    setEstados(new Map(ordem.map((m) => [m.modeloId, { tipo: "fila" } as EstadoNaCena])));
    setDados(new Map());
    void (async () => {
      for (const m of ordem) {
        if (cancelado) return;
        await abrir(engine, m, () => cancelado);
      }
      // O motor enquadra só o primeiro modelo que entra; com todos na cena, enquadra o conjunto.
      if (!cancelado && ordem.length > 1) await engine.enquadrar();
    })();
    return () => {
      cancelado = true;
    };
  }, [engine, prontos, focoInicial, abrir]);

  const tentarDeNovo = useCallback(
    (modeloId: string) => {
      const m = prontos.find((x) => x.modeloId === modeloId);
      if (engine && m) void abrir(engine, m, () => false);
    },
    [engine, prontos, abrir],
  );

  const carregados = useMemo(() => prontos.map((m) => m.modeloId).filter((id) => dados.has(id)), [prontos, dados]);

  // Pavimentos dos modelos ligados, unidos por nome.
  const pavimentos = useMemo(
    () => unirPavimentos(carregados.filter((id) => !desligados.has(id)).flatMap((id) => dados.get(id)?.pavimentos ?? [])),
    [carregados, desligados, dados],
  );
  const pavimentoAtivo = pavimentos.find((p) => p.chave === pavimentoSel) ?? null;

  // Visibilidade: modelos desligados escondidos, pavimento escolhido isolado nos ligados.
  useEffect(() => {
    if (!engine || carregados.length === 0) return;
    const todosIds = new Map(carregados.map((id) => [id, dados.get(id)?.todosIds ?? []]));
    const v = visibilidadeDoPortal({ carregados, desligados, pavimento: pavimentoAtivo, todosIds });
    void (v === "tudo" ? engine.mostrarTudo() : engine.isolarPorModelo(v));
  }, [engine, carregados, desligados, pavimentoAtivo, dados]);

  // Destaque do modelo em foco (os outros ficam translúcidos), reaplicado a cada modelo que entra.
  useEffect(() => {
    if (!engine || carregados.length === 0) return;
    void engine.destacarModelo(destaque && carregados.includes(destaque) ? destaque : null);
  }, [engine, carregados, destaque]);

  // Corte horizontal (eixo Z do IFC = altura) e a faixa de altura, que muda quando um modelo entra.
  useEffect(() => {
    if (!engine) return;
    engine.definirCorte(corte.ativo ? { eixo: "z", posicao: corte.posicao, invertido: false } : null);
  }, [engine, corte, carregados]);
  useEffect(() => {
    if (!engine || carregados.length === 0) {
      setFaixaY(null);
      return;
    }
    const caixas = engine.caixasDosModelos();
    if (caixas.length === 0) return setFaixaY(null);
    setFaixaY({ min: Math.min(...caixas.map((c) => c.min[1])), max: Math.max(...caixas.map((c) => c.max[1])) });
  }, [engine, carregados]);

  const ligar = useCallback(
    (modeloId: string, ligado: boolean) => {
      setDesligados((atual) => {
        const n = new Set(atual);
        if (ligado) n.delete(modeloId);
        else n.add(modeloId);
        return n;
      });
      if (!ligado) {
        if (destaque === modeloId) setDestaque(null);
        if (selecao?.modeloId === modeloId) void engine?.limparSelecao();
      }
    },
    [destaque, selecao, engine],
  );

  const onSelecionar = useCallback((info: SelecaoInfo | null) => setSelecao(info), []);

  // No painel lateral, as propriedades ficam no fim: ao clicar num elemento, rola até elas.
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selecao) asideRef.current?.querySelector("section[aria-label=Propriedades]")?.scrollIntoView({ block: "nearest" });
  }, [selecao]);

  const pavimentoDaSelecao = selecao ? (dados.get(selecao.modeloId)?.pavimentoPorLocalId.get(selecao.localId) ?? null) : null;
  const modeloDaSelecao = selecao ? modelos.find((m) => m.modeloId === selecao.modeloId) : undefined;
  const propriedades = selecao ? (
    <div className="space-y-2">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
        {modeloDaSelecao && (
          <>
            <dt className="text-muted-foreground">Modelo</dt>
            <dd className="truncate font-medium" title={modeloDaSelecao.rotulo}>
              {modeloDaSelecao.rotulo}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Pavimento</dt>
        <dd className="truncate font-medium">{pavimentoDaSelecao ?? "Não informado"}</dd>
      </dl>
      <PainelPropriedades selecao={selecao} />
    </div>
  ) : (
    <p className="text-xs text-muted-foreground">Toque ou clique num elemento do modelo para ver as propriedades dele.</p>
  );

  const alturaDoCorte = faixaY ? (faixaY.max - faixaY.min) * corte.posicao : null;
  const algumCarregando = [...estados.values()].some((e) => e.tipo === "carregando" || e.tipo === "fila");
  const nenhumNaCena = carregados.length === 0;
  const falhas = prontos.filter((m) => estados.get(m.modeloId)?.tipo === "falhou");
  // Nada na cena, nada abrindo e algum modelo falhou: o aviso vai no meio da tela (no celular o painel fica na folha).
  const mostrarFalha = nenhumNaCena && !algumCarregando && falhas.length > 0;
  // O motivo da rota só quando é um só (vários modelos com o mesmo motivo contam como um).
  const motivosDaFalha = [
    ...new Set(falhas.map((m) => estadoFalha(estados.get(m.modeloId))).filter((x): x is string => x !== null)),
  ];
  // Um por vez, como na carga inicial, e enquadra o conjunto no fim (o motor só enquadra o primeiro que entra).
  const tentarFalhasDeNovo = () => {
    if (!engine) return;
    const eng = engine;
    void (async () => {
      for (const m of falhas) await abrir(eng, m, () => false);
      await eng.enquadrar();
    })();
  };

  const painel = (
    <PainelModelo
      modelos={modelos}
      estados={estados}
      desligados={desligados}
      destaque={destaque}
      onLigar={ligar}
      onTentarDeNovo={tentarDeNovo}
      onTirarDestaque={() => setDestaque(null)}
      pavimentos={pavimentos}
      pavimentoSel={pavimentoAtivo?.chave ?? null}
      onPavimento={setPavimentoSel}
      corte={corte}
      onCorte={setCorte}
      alturaDoCorte={alturaDoCorte}
      propriedades={propriedades}
    />
  );

  return (
    <div
      ref={quadro.ref}
      style={quadro.style}
      className="grid h-[75svh] min-h-0 grid-cols-1 gap-3 md:h-auto lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
          <Button size="sm" variant="outline" onClick={() => void engine?.enquadrar()} disabled={nenhumNaCena}>
            <Maximize className="size-4" /> Enquadrar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={nenhumNaCena} />}>
              <Box className="size-4" /> Vistas
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-auto min-w-52">
              {VISTAS_PADRAO.map((v) => (
                <DropdownMenuItem key={v.id} onClick={() => void engine?.irParaVista(v.id)}>
                  {v.rotulo}
                  <DropdownMenuShortcut>{v.atalho}</DropdownMenuShortcut>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" className="ml-auto lg:hidden" onClick={() => setFolhaAberta(true)}>
            <SlidersHorizontal className="size-4" /> Modelos e corte
          </Button>
        </div>
        <div className="relative min-h-0 flex-1 bg-muted/20">
          <Viewer3D onReady={setEngine} onSelecionar={onSelecionar} />
          {nenhumNaCena && algumCarregando && (
            <p
              role="status"
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-background/85 px-4 py-2 text-sm text-muted-foreground backdrop-blur"
            >
              Abrindo o modelo 3D…
            </p>
          )}
          {mostrarFalha && (
            <div
              role="alert"
              className="absolute left-1/2 top-1/2 flex w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-md border bg-background/95 px-4 py-3 text-center text-sm shadow-sm backdrop-blur"
            >
              <p className="font-medium text-destructive-text">Não foi possível abrir o modelo.</p>
              {motivosDaFalha.length === 1 && <p className="text-xs text-muted-foreground">{motivosDaFalha[0]}</p>}
              <Button size="sm" variant="outline" onClick={tentarFalhasDeNovo}>
                <RotateCw className="size-4" /> Tentar de novo
              </Button>
            </div>
          )}
          {selecao && (
            <Button
              size="sm"
              variant="secondary"
              className="absolute bottom-3 left-3 shadow-sm lg:hidden"
              onClick={() => setFolhaAberta(true)}
            >
              <Info className="size-4" /> Propriedades
            </Button>
          )}
        </div>
      </div>

      <aside ref={asideRef} className="hidden min-h-0 overflow-y-auto rounded-lg border bg-card p-3 lg:block" aria-label="Modelo 3D">
        {painel}
      </aside>

      <Sheet open={folhaAberta} onOpenChange={setFolhaAberta}>
        <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Modelo 3D</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{painel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
