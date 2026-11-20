"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Box, Footprints, Info, ListChecks, Maximize, MessageSquarePlus, RotateCw, SlidersHorizontal } from "lucide-react";
import type { ModeloDoPortal } from "@/modules/portal/modelo3d/queries";
import {
  ehSemPavimento,
  gruposDePavimento,
  pontoNaCena,
  pontoNoModelo,
  vistaNaCena,
  vistaNoModelo,
  unirPavimentos,
  visibilidadeDoPortal,
  type PavimentoDoModelo,
} from "@/modules/portal/modelo3d/regras";
import type { SelecaoInfo, ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import { VISTAS_PADRAO } from "@/modules/coordenacao/viewer/vistas";
import { elementosDoPiso, maisBaixoParaAndar, pisoDeEntrada } from "@/modules/coordenacao/viewer/andar";
import { CamadaAndar } from "@/components/coordenacao/controle-andar";
import { cn } from "@/lib/utils";
import { useAlturaRestante } from "@/lib/use-altura-restante";
import { LIMITE_TEXTO_MARCACAO, MAX_MARCACOES } from "@/modules/portal/pedido-revisao/regras";
import type { MarcaModeloLeitura } from "@/modules/portal/pedido-revisao/modelo-regras";
import { criarPedidoModelo } from "@/modules/portal/pedido-revisao/actions";
import { enviarAnexosDoPedido } from "@/components/portal/pedir-revisao-dialog";
import {
  chaveDoRascunhoModelo,
  gravarRascunhoModelo,
  lerRascunhoModelo,
  limparRascunho,
  type MarcacaoModeloRascunho,
  type RascunhoModelo,
} from "@/components/portal/visualizador/rascunho-local";
import { MarcadoresModelo, type MarcadorModelo } from "@/components/portal/modelo3d/marcadores-modelo";
import {
  ListaMarcasLeitura,
  PainelPedidoModelo,
  enviarImagensDasVistas,
  imagemQueCabe,
} from "@/components/portal/modelo3d/modo-pedir";
import { PainelPropriedades } from "@/components/coordenacao/painel-propriedades";
import { PainelModelo, type CorteHorizontal, type EstadoNaCena } from "@/components/portal/modelo3d/painel-modelo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const categoria = new Map(indice.map((e) => [e.localId, e.category]));
  const pavimentos: PavimentoDoModelo[] = [];
  for (const g of gruposDePavimento(indice)) {
    // Piso sem as fundações (regra única com o andar, `elementosDoPiso`).
    const piso = elementosDoPiso(g.localIds.map((localId) => ({ localId, category: categoria.get(localId) })));
    const pisoY = await engine.pisoDoPavimento(m.modeloId, piso.elementos.map((e) => e.localId));
    pavimentos.push({ modeloId: m.modeloId, nome: g.nome, pisoY, localIds: g.localIds, soFundacao: piso.soFundacao });
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

/** Marcação recém-clicada, esperando o texto (a imagem da vista já capturada, ou null). */
type NovaMarcacao = Omit<MarcacaoModeloRascunho, "id" | "texto"> & { imagem: Blob | null; onde: string };

const RASCUNHO_VAZIO: RascunhoModelo = { comentario: "", marcacoes: [] };
const SEM_DESLOCAMENTO: [number, number, number] = [0, 0, 0];

/**
 * Visualizador 3D do portal do cliente (spec 2026-11-20, "Explorar" e "Pedir revisão no modelo"): carrega todos os
 * modelos prontos juntos, com liga/desliga por modelo, pavimentos unidos por nome, corte horizontal, propriedades do
 * elemento clicado, enquadrar e vistas padrão. Desligar um modelo só o esconde (fica na memória, religar é instantâneo).
 * Com `pedir`, o botão "Pedir revisão" faz cada clique num elemento virar uma marcação (elemento, ponto, vista e imagem
 * da vista); o rascunho fica no navegador até "Enviar pedido". Com `leitura` (detalhe da coordenação), mostra as
 * marcações de um pedido enviado, com "Ir para" cada vista. NÃO usa a tela da Coordenação: nada interno aparece aqui.
 */
export function VisualizadorModelo({
  projetoId,
  modelos,
  foco = null,
  pedir = null,
  aguardando = [],
  leitura = null,
}: {
  projetoId: string;
  modelos: ModeloDoPortal[];
  /** `?modelo=` da URL: o modelo servido (ou a origem nas Entregas) que abre em destaque. */
  foco?: string | null;
  /** `userId` = a conta do portal (o rascunho no navegador é dela); `voltarPara` = para onde ir depois de enviar. */
  pedir?: { userId: string; voltarPara: string } | null;
  /** Marcações de pedidos que ainda aguardam a equipe (esmaecidas: ninguém pede duas vezes). */
  aguardando?: MarcaModeloLeitura[];
  /** Detalhe da coordenação: as marcações do pedido, só leitura. */
  leitura?: MarcaModeloLeitura[] | null;
}) {
  const router = useRouter();
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
  const [andando, setAndando] = useState(false);

  // Pedido de revisão no modelo (só com `pedir`).
  const [pedindo, setPedindo] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoModelo>(RASCUNHO_VAZIO);
  const [nova, setNova] = useState<NovaMarcacao | null>(null);
  const [textoNova, setTextoNova] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [folhaPedido, setFolhaPedido] = useState(false);
  const [enviando, startEnvio] = useTransition();
  /** Imagens das vistas, só na memória da aba (o rascunho no navegador não guarda nada binário). */
  const imagensRef = useRef(new Map<string, Blob>());
  const [comImagem, setComImagem] = useState<ReadonlySet<string>>(new Set());
  const chaveRascunho = chaveDoRascunhoModelo(projetoId, pedir?.userId ?? "");
  const idTextoNova = useId();

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

  // Modo andar: entra no pavimento escolhido ou, sem escolha, no mais baixo que não é só de fundação, no centro dele em
  // planta; sem pavimento algum, no fundo da cena.
  const alternarAndar = async () => {
    if (!engine) return;
    if (engine.andando) return void engine.sairAndar();
    const pav = pavimentoAtivo ?? maisBaixoParaAndar(pavimentos.filter((p) => !ehSemPavimento(p)));
    const piso = pav && Number.isFinite(pav.pisoY) ? pav.pisoY : pisoDeEntrada([], engine.caixasDosModelos());
    if (piso === null) return;
    const caixa = pav ? await engine.caixaDosElementos(pav.porModelo) : null;
    engine.iniciarAndar({ pisoY: piso, caixa });
  };
  // Trocar o pavimento enquanto anda leva o olho à altura do novo (só quando a escolha muda).
  const pavimentoDoAndarRef = useRef<string | null>(null);
  useEffect(() => {
    const chave = pavimentoAtivo?.chave ?? null;
    if (!engine || !andando || !pavimentoAtivo || pavimentoDoAndarRef.current === chave) {
      pavimentoDoAndarRef.current = chave;
      return;
    }
    pavimentoDoAndarRef.current = chave;
    engine.trocarPisoDoAndar(pavimentoAtivo.pisoY);
  }, [engine, andando, pavimentoAtivo]);

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

  const rotuloDoModelo = useCallback(
    (modeloId: string) => modelos.find((m) => m.modeloId === modeloId)?.rotulo ?? "Modelo",
    [modelos],
  );

  // Rascunho guardado neste navegador: volta direto ao modo de pedido (sem as imagens, que não são guardadas).
  useEffect(() => {
    if (!pedir) return;
    const r = lerRascunhoModelo(chaveRascunho);
    if (r) {
      setRascunho(r);
      setPedindo(true);
      toast.info("Seu rascunho de pedido no modelo 3D foi recuperado.");
    }
  }, [pedir, chaveRascunho]);

  function mudarRascunho(fn: (r: RascunhoModelo) => RascunhoModelo) {
    setRascunho((r) => {
      const novo = fn(r);
      gravarRascunhoModelo(chaveRascunho, novo);
      return novo;
    });
  }

  // Clique num elemento: no modo de pedido vira marcação (o ponto só vem do clique — "ir para" seleciona sem ponto).
  async function marcarDaSelecao(info: SelecaoInfo) {
    if (!engine || !info.ponto) return;
    if (rascunho.marcacoes.length >= MAX_MARCACOES) {
      toast.error(`O pedido aceita no máximo ${MAX_MARCACOES} marcações.`);
      return;
    }
    // Gravada no referencial do modelo da marcação (como se ele tivesse aberto primeiro — o link da Coordenação).
    const d = engine.deslocamentoDoModelo(info.modeloId) ?? SEM_DESLOCAMENTO;
    const camera = vistaNoModelo(engine.capturarCamera(), d);
    const bruta = await engine.capturarSnapshot().catch(() => null);
    const imagem = bruta ? await imagemQueCabe(bruta) : null;
    const pavimento = dados.get(info.modeloId)?.pavimentoPorLocalId.get(info.localId) ?? null;
    setTextoNova("");
    setNova({
      modeloId: info.modeloId,
      guids: info.guid ? [info.guid] : [],
      ponto: pontoNoModelo(info.ponto, d),
      camera,
      imagem,
      onde: [rotuloDoModelo(info.modeloId), pavimento].filter(Boolean).join(" · "),
    });
  }

  // O Viewer3D chama sempre a versão mais recente deste callback (ele guarda o último numa ref).
  const onSelecionar = (info: SelecaoInfo | null) => {
    setSelecao(info);
    if (pedindo && info) void marcarDaSelecao(info);
  };

  function confirmarNova() {
    if (!nova || !textoNova.trim()) return;
    const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const marcacao: MarcacaoModeloRascunho = {
      id,
      modeloId: nova.modeloId,
      guids: nova.guids,
      ponto: nova.ponto,
      camera: nova.camera,
      texto: textoNova.trim(),
    };
    if (nova.imagem) {
      imagensRef.current.set(id, nova.imagem);
      setComImagem(new Set(imagensRef.current.keys()));
    }
    mudarRascunho((r) => ({ ...r, marcacoes: [...r.marcacoes, marcacao] }));
    setNova(null);
    setTextoNova("");
  }

  function removerMarcacao(id: string) {
    imagensRef.current.delete(id);
    setComImagem(new Set(imagensRef.current.keys()));
    mudarRascunho((r) => ({ ...r, marcacoes: r.marcacoes.filter((m) => m.id !== id) }));
  }

  function descartar() {
    limparRascunho(chaveRascunho);
    imagensRef.current.clear();
    setComImagem(new Set());
    setRascunho(RASCUNHO_VAZIO);
    setArquivos([]);
    setPedindo(false);
    setFolhaPedido(false);
  }

  /** "Ir para": a vista da marcação, com o elemento selecionado (religa o modelo, se estava desligado). */
  function irPara(m: { modeloId: string; guids: string[]; camera: MarcacaoModeloRascunho["camera"] | null }) {
    if (!engine || !m.camera) return;
    if (desligados.has(m.modeloId)) ligar(m.modeloId, true);
    setFolhaAberta(false);
    setFolhaPedido(false);
    void (async () => {
      await engine.restaurarCamera(vistaNaCena(m.camera!, engine.deslocamentoDoModelo(m.modeloId) ?? SEM_DESLOCAMENTO));
      if (m.guids.length > 0) await engine.selecionarPorGuids(m.guids);
    })();
  }

  function enviar() {
    if (!pedir) return;
    const marcacoes = rascunho.marcacoes;
    startEnvio(async () => {
      const r = await criarPedidoModelo({
        projetoId,
        comentario: rascunho.comentario,
        marcacoes: marcacoes.map((m) => ({ modeloId: m.modeloId, guids: m.guids, ponto: m.ponto, camera: m.camera, texto: m.texto })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const envios = r.data.marcacaoIds.flatMap((marcacaoId, i) => {
        const imagem = imagensRef.current.get(marcacoes[i]?.id ?? "");
        return imagem ? [{ marcacaoId, imagem }] : [];
      });
      const falhasImagem = await enviarImagensDasVistas(r.data.id, envios);
      const falhasAnexo = await enviarAnexosDoPedido(r.data.id, arquivos);
      limparRascunho(chaveRascunho);
      imagensRef.current.clear();
      toast.success("Pedido enviado à equipe. A resposta aparece no portal.");
      if (falhasImagem > 0) {
        toast.error(
          falhasImagem === 1
            ? "Uma imagem da vista não foi enviada. A marcação segue valendo, com o elemento e a vista."
            : `${falhasImagem} imagens da vista não foram enviadas. As marcações seguem valendo, com o elemento e a vista.`,
        );
      }
      for (const f of falhasAnexo) toast.error(`${f} O pedido foi enviado sem este anexo.`);
      router.push(pedir.voltarPara);
      router.refresh();
    });
  }

  // No painel lateral, as propriedades ficam no fim: ao clicar num elemento, rola até elas — menos no modo de pedido,
  // em que o topo do painel é a lista de marcações que acabou de ganhar uma.
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selecao && !pedindo) asideRef.current?.querySelector("section[aria-label=Propriedades]")?.scrollIntoView({ block: "nearest" });
  }, [selecao, pedindo]);

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

  // Alfinetes: os do pedido em edição, os do pedido aberto (leitura) e, esmaecidos, os de outros pedidos aguardando.
  // Só nos modelos abertos e ligados (o alfinete de um modelo escondido ficaria solto no ar).
  const naCena = (modeloId: string) => carregados.includes(modeloId) && !desligados.has(modeloId);
  const naCenaDo = (modeloId: string, p: [number, number, number]) =>
    pontoNaCena(p, engine?.deslocamentoDoModelo(modeloId) ?? SEM_DESLOCAMENTO);
  const marcadores: MarcadorModelo[] = [
    ...(leitura ? [] : aguardando)
      .filter((m) => m.ponto && naCena(m.modeloId))
      .map((m) => ({ id: m.id, numero: m.numero, ponto: naCenaDo(m.modeloId, m.ponto!), texto: m.texto, variante: "esmaecida" as const })),
    ...(leitura ?? [])
      .filter((m) => m.ponto && naCena(m.modeloId))
      .map((m) => ({ id: m.id, numero: m.numero, ponto: naCenaDo(m.modeloId, m.ponto!), texto: m.texto, variante: "leitura" as const })),
    ...(pedindo ? rascunho.marcacoes : [])
      .map((m, i) => ({ m, numero: i + 1 }))
      .filter(({ m }) => naCena(m.modeloId))
      .map(({ m, numero }) => ({ id: m.id, numero, ponto: naCenaDo(m.modeloId, m.ponto), texto: m.texto, variante: "rascunho" as const })),
  ];
  const irParaMarcador = (id: string) => {
    const m = [...rascunho.marcacoes, ...(leitura ?? []), ...aguardando].find((x) => x.id === id);
    if (m) irPara(m);
  };
  const aguardandoNaCena = !leitura && aguardando.some((m) => naCena(m.modeloId));

  const painelPedido = (
    <PainelPedidoModelo
      marcacoes={rascunho.marcacoes}
      rotuloDoModelo={rotuloDoModelo}
      temImagem={(id) => comImagem.has(id)}
      onTexto={(id, texto) => mudarRascunho((r) => ({ ...r, marcacoes: r.marcacoes.map((m) => (m.id === id ? { ...m, texto } : m)) }))}
      onRemover={removerMarcacao}
      onIr={(id) => {
        const m = rascunho.marcacoes.find((x) => x.id === id);
        if (m) irPara(m);
      }}
      comentario={rascunho.comentario}
      onComentario={(comentario) => mudarRascunho((r) => ({ ...r, comentario }))}
      arquivos={arquivos}
      onArquivos={setArquivos}
      onEnviar={enviar}
      onDescartar={descartar}
      enviando={enviando}
    />
  );
  const listaLeitura = leitura ? (
    <ListaMarcasLeitura titulo="Marcações do cliente" marcas={leitura} rotuloDoModelo={rotuloDoModelo} onIr={irParaMarcador} />
  ) : null;
  const legenda = pedindo
    ? "Clique no elemento que você quer mudar: a vista atual e a imagem dela vão junto com a marcação."
    : leitura
      ? "Os números seguem a lista do pedido. \"Ir para\" volta à vista que o cliente marcou."
      : aguardandoNaCena
        ? "Em cinza: marcações de pedidos que ainda aguardam a equipe."
        : null;

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
          <Button
            size="sm"
            variant={andando ? "default" : "outline"}
            aria-pressed={andando}
            onClick={() => void alternarAndar()}
            // Até todos abrirem: o enquadramento do fim da carga tiraria a câmera do andar.
            disabled={!andando && (nenhumNaCena || algumCarregando)}
          >
            <Footprints className="size-4" /> {andando ? "Sair do modo andar" : "Andar"}
          </Button>
          {pedir && !pedindo && (
            <Button size="sm" onClick={() => setPedindo(true)} disabled={nenhumNaCena}>
              <MessageSquarePlus className="size-4" /> Pedir revisão
            </Button>
          )}
          {pedindo && (
            <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setFolhaPedido(true)}>
              <ListChecks className="size-4" /> Pedido ({rascunho.marcacoes.length})
            </Button>
          )}
          <Button size="sm" variant="outline" className="ml-auto lg:hidden" onClick={() => setFolhaAberta(true)}>
            <SlidersHorizontal className="size-4" /> Modelos e corte
          </Button>
        </div>
        {legenda && (
          <p role="status" className="border-b px-3 py-1 text-xs text-muted-foreground">
            {legenda}
          </p>
        )}
        <div className="relative min-h-0 flex-1 bg-muted/20">
          <Viewer3D onReady={setEngine} onSelecionar={onSelecionar} onAndar={setAndando} />
          {marcadores.length > 0 && <MarcadoresModelo engine={engine} marcadores={marcadores} onIr={irParaMarcador} />}
          {andando && (
            <CamadaAndar onSair={() => void engine?.sairAndar()} onJoystick={(v) => engine?.definirJoystick(v)} />
          )}
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
              // Andando, o canto de baixo é da ajuda e do controle de direção.
              className={cn("absolute left-3 shadow-sm lg:hidden", andando ? "top-3" : "bottom-3")}
              onClick={() => setFolhaAberta(true)}
            >
              <Info className="size-4" /> Propriedades
            </Button>
          )}
        </div>
      </div>

      <aside ref={asideRef} className="hidden min-h-0 overflow-y-auto rounded-lg border bg-card p-3 lg:block" aria-label="Modelo 3D">
        {pedindo && (
          <section className="mb-4 space-y-3" aria-label="Pedido de revisão">
            <h2 className="text-sm font-semibold">Pedido de revisão</h2>
            {painelPedido}
            <Separator />
          </section>
        )}
        {listaLeitura && <div className="mb-4 space-y-4">{listaLeitura}<Separator /></div>}
        {painel}
      </aside>

      <Sheet open={folhaAberta} onOpenChange={setFolhaAberta}>
        <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Modelo 3D</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            {listaLeitura}
            {painel}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={folhaPedido} onOpenChange={setFolhaPedido}>
        <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Pedido de revisão</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{painelPedido}</div>
        </SheetContent>
      </Sheet>

      <Dialog open={nova !== null} onOpenChange={(o) => !o && setNova(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>O que mudar aqui?</DialogTitle>
            <DialogDescription className="break-words">
              {nova?.onde ? `${nova.onde}. ` : ""}O texto vai junto da marcação para a equipe, com a vista atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={idTextoNova} className="sr-only">
              Texto da marcação
            </Label>
            <textarea
              id={idTextoNova}
              autoFocus
              rows={3}
              maxLength={LIMITE_TEXTO_MARCACAO}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={textoNova}
              onChange={(e) => setTextoNova(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNova(null)}>
              Descartar marcação
            </Button>
            <Button onClick={confirmarNova} disabled={!textoNova.trim()}>
              Guardar marcação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
