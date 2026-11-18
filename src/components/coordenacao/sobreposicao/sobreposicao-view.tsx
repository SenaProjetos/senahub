"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crosshair, Layers, Loader2, MapPin, Maximize } from "lucide-react";
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
import {
  RECORTE_CONTEXTO,
  hrefDoPino,
  motivoParaNaoApontar,
  pinoDoApontamento,
  pinoMaisProximo,
  pinosNoMundo,
  rascunhosPorPrancha,
} from "@/modules/coordenacao/sobreposicao/apontar";
import { cruzamentos, regiaoParaMundo } from "@/modules/coordenacao/sobreposicao/cruzamentos";
import { mascaraDeTinta } from "@/modules/coordenacao/sobreposicao/pixels";
import type { CamadaDaCena, CenaSobreposicao } from "@/modules/coordenacao/sobreposicao/queries";
import { criarPendencia } from "@/modules/projetos/pendencias/actions";
import { atalhoNoAlvo } from "@/modules/coordenacao/sobreposicao/atalhos";
import {
  COR_ALERTA,
  COR_ARQUITETURA_ALINHANDO,
  MOTIVO_CORRIDA_ALINHAMENTO,
  alinhamentoEfetivo,
  mundoDaCena,
  type Formato,
} from "@/modules/coordenacao/sobreposicao/regras";
import {
  aceitarVersao,
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
import { aplicar, type Alinhamento, type Caixa, type Ponto } from "@/modules/coordenacao/sobreposicao/transformacao";
import { limparSeparadores, type AcaoItemAcao } from "@/components/ui/acoes";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAlturaRestante } from "@/lib/use-altura-restante";
import { AdicionarCamadaDialog, type DocumentoParaCamada } from "./adicionar-camada-dialog";
import { ApontarDialog, type DadosApontamento } from "./apontar-dialog";
import { CortinaDivisor } from "./cortina-divisor";
import { RAIO_CLIQUE_PINO, desenharMira, desenharPinos } from "./desenhar-pinos";
import { FerramentaAlinhar, desenharMarcadores } from "./ferramenta-alinhar";
import { PainelCamadas, type AjusteCamada, type ModoGravar } from "./painel-camadas";
import { Palco, type CamadaNoPalco, type CortinaPalco, type PalcoHandle, type VistaPalco } from "./palco";
import { RascunhosPainel } from "./rascunhos-painel";
import { colorir, tamanhoDaPagina } from "./render-pdf";
import { useCamadasRenderizadas } from "./use-camadas-renderizadas";
import { useTamanhosPdf } from "./use-tamanhos-pdf";

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

/** Os atalhos só valem com o foco na página ou no desenho (botão, aba e campo ficam com a tecla deles). */
const atalhoNoEvento = (ev: KeyboardEvent) => atalhoNoAlvo(ev.target instanceof Element ? ev.target : null);

const chaveAlinhamento = (camadaId: string, formato: Formato) => `${camadaId}:${formato}`;

const MENSAGEM_SEM_IMAGEM = "Apontamento criado, mas a imagem da sobreposição não foi anexada.";

type Modo = "sobrepor" | "cortina" | "cruzamentos";

function desenharCruzamentos(ctx: CanvasRenderingContext2D, vista: VistaPalco, caixas: readonly Caixa[]) {
  if (caixas.length === 0) return;
  ctx.save();
  ctx.strokeStyle = COR_ALERTA;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  for (const k of caixas) {
    const a = aplicar(vista, { x: k.minX, y: k.minY });
    const b = aplicar(vista, { x: k.maxX, y: k.maxY });
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
  ctx.restore();
}

/** Seletor de camada dos modos Cortina e Cruzamentos. */
function SeletorCamada({
  rotulo,
  valor,
  camadas,
  onValor,
}: {
  rotulo: string;
  valor: string | null;
  camadas: CamadaDaCena[];
  onValor: (id: string) => void;
}) {
  return (
    <Select value={valor ?? ""} onValueChange={(v) => v && onValor(v)}>
      <SelectTrigger size="sm" className="w-44" aria-label={rotulo}>
        <SelectValue placeholder={rotulo} />
      </SelectTrigger>
      <SelectContent>
        {camadas.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.disciplina}
            {c.base ? " (base)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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
  // Trava do alinhamento: outra pessoa salvou antes. "Manter o meu" recarrega e passa a ler a versão dela.
  const [corrida, setCorrida] = useState<"aviso" | "atualizando" | null>(null);
  // "Apontar interferência": ligado, o clique no desenho escolhe o ponto e abre o diálogo.
  const [apontando, setApontando] = useState(false);
  const [pontoApontar, setPontoApontar] = useState<Ponto | null>(null);
  // Modos de ver: Sobrepor (todas), Cortina (base × uma camada) e Cruzamentos (tinta de duas no mesmo lugar).
  const [modo, setModo] = useState<Modo>("sobrepor");
  const [cortinaId, setCortinaId] = useState<string | null>(null);
  const [corte, setCorte] = useState(0.5);
  const [parCruzamento, setParCruzamento] = useState<[string | null, string | null]>([null, null]);
  const [caixasCruzamento, setCaixasCruzamento] = useState<Caixa[]>([]);
  const [vistaAssentou, setVistaAssentou] = useState(0);
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
  const tamanhos = useTamanhosPdf(camadas);
  const pinos = useMemo(() => pinosNoMundo(camadas, tamanhos), [camadas, tamanhos]);
  const rascunhos = useMemo(() => rascunhosPorPrancha(camadas), [camadas]);

  // A camada sumiu ou trocou de formato no meio do alinhamento: a sessão não vale mais.
  useEffect(() => {
    if (!sessao) return;
    const c = camadas.find((x) => x.id === sessao.camadaId);
    if (!c || c.formato !== sessao.formato) setSessao(null);
  }, [camadas, sessao]);

  // Chegou a cena recarregada depois de "Manter o meu": a sessão lê a versão nova e segue com o alinhamento dela.
  useEffect(() => {
    if (corrida !== "atualizando") return;
    setSessao((s) => {
      if (!s) return s;
      const c = cena.camadas.find((x) => x.id === s.camadaId);
      return aceitarVersao(s, c?.alinhamentos[s.formato]?.versao ?? null);
    });
    setCorrida(null);
    // Só a chegada da cena nova importa aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cena.camadas]);

  const gravar = useCallback(
    (camadaId: string) => {
      const p = pendentes.current.get(camadaId);
      if (!p) return;
      pendentes.current.delete(camadaId);
      if (p.timer) clearTimeout(p.timer);
      const ajuste = p.ajuste;
      // Falhou (recusa ou rede): a tela volta ao que o servidor tem.
      const desfazerAjuste = (mensagem: string) => {
        toast.error(mensagem);
        setAjustes((a) => {
          const atual = { ...a[camadaId] };
          for (const k of Object.keys(ajuste) as (keyof AjusteCamada)[]) delete atual[k];
          return { ...a, [camadaId]: atual };
        });
      };
      void atualizarCamada({ camadaId, ...ajuste }).then(
        (r) => {
          if (!r.ok) desfazerAjuste(r.error);
        },
        () => desfazerAjuste("Não foi possível gravar a mudança da camada. Confira a conexão."),
      );
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

  // Mundo = `mundoDaCena`: a base pelo alinhamento SALVO dela (alinhar a base não move o mundo); base sem
  // alinhamento encaixa nas camadas já alinhadas, sem redefinir o mundo. Cada camada entra pelo seu, e a que
  // está sendo alinhada pelo da sessão.
  const { noPalco, caixaMundo } = useMemo(() => {
    const salvo = (c: CamadaDaCena) =>
      recemSalvos[chaveAlinhamento(c.id, c.formato)] ?? c.alinhamentos[c.formato]?.alinhamento ?? null;
    const base = camadas.find((c) => c.base);
    const eBase = base ? estados[base.id] : undefined;
    const alinhadas: { caixaNativa: Caixa; alinhamento: Alinhamento }[] = [];
    for (const c of camadas) {
      const e = estados[c.id];
      const al = c.base ? null : salvo(c);
      if (e?.tipo === "pronto" && al) alinhadas.push({ caixaNativa: e.render.caixaNativa, alinhamento: al });
    }
    const daCena = mundoDaCena(
      base && eBase?.tipo === "pronto" ? { caixaNativa: eBase.render.caixaNativa, salvo: salvo(base) } : null,
      alinhadas,
    );
    const mundo = daCena?.caixaMundo ?? null;
    const lista: CamadaNoPalco[] = [];
    for (const c of camadas) {
      const e = estados[c.id];
      if (e?.tipo !== "pronto") continue;
      if (e.render.formato === "pdf") colorir(e.render, c.cor);
      const nativa = e.render.caixaNativa;
      const alinhando = sessao !== null && sessao.camadaId === c.id;
      const doMundo =
        c.base && daCena ? daCena.alinhamentoBase : (salvo(c) ?? alinhamentoEfetivo(c, mundo ?? nativa, nativa));
      lista.push({
        id: c.id,
        render: e.render,
        alinhamento: alinhando ? sessao.atual : doMundo,
        cor: c.cor,
        opacidade: c.opacidade,
        visivel: c.visivel,
        ...(alinhando ? { corArquitetura: COR_ARQUITETURA_ALINHANDO } : {}),
      });
    }
    return { noPalco: lista, caixaMundo: mundo };
  }, [camadas, estados, sessao, recemSalvos]);

  const camadaAlinhando = sessao ? (camadas.find((c) => c.id === sessao.camadaId) ?? null) : null;

  // Padrões dos modos: a base de um lado e a primeira outra camada do outro.
  const baseId = camadas.find((c) => c.base)?.id ?? null;
  const primeiraOutra = camadas.find((c) => !c.base)?.id ?? null;
  const existe = (id: string | null) => id !== null && camadas.some((c) => c.id === id);
  const camadaCortina = existe(cortinaId) ? cortinaId : primeiraOutra;
  const cruzA = existe(parCruzamento[0]) ? parCruzamento[0] : baseId;
  const cruzB = existe(parCruzamento[1]) ? parCruzamento[1] : primeiraOutra;
  const nome = (id: string | null) => camadas.find((c) => c.id === id)?.disciplina ?? "";

  const cortinaNoPalco = useMemo<CortinaPalco | null>(
    () => (modo === "cortina" && baseId && camadaCortina ? { baseId, camadaId: camadaCortina, corte } : null),
    [modo, baseId, camadaCortina, corte],
  );

  // Cruzamentos: recalcula ao trocar o par, quando as camadas chegam e quando a vista assenta (não a cada quadro).
  useEffect(() => {
    if (modo !== "cruzamentos" || !cruzA || !cruzB || cruzA === cruzB) {
      setCaixasCruzamento([]);
      return;
    }
    const a = palcoRef.current?.rasterizarCamada(cruzA);
    const b = palcoRef.current?.rasterizarCamada(cruzB);
    if (!a || !b) {
      setCaixasCruzamento([]);
      return;
    }
    const regioes = cruzamentos(mascaraDeTinta(a.dados), mascaraDeTinta(b.dados), a.largura, a.altura);
    setCaixasCruzamento(regioes.map((r) => regiaoParaMundo(r, a.vista, a.densidade)));
  }, [modo, cruzA, cruzB, noPalco, vistaAssentou]);

  function aoAlinhar(camadaId: string) {
    const c = camadas.find((x) => x.id === camadaId);
    const noP = noPalco.find((x) => x.id === camadaId);
    if (!c || !noP || estados[camadaId]?.tipo !== "pronto") {
      toast.error(MOTIVO_SEM_DESENHO);
      return;
    }
    setGaveta(false);
    setModo("sobrepor");
    setApontando(false);
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
      let r: Awaited<ReturnType<typeof salvarAlinhamento>>;
      try {
        r = await salvarAlinhamento({ camadaId, formato, alinhamento: atual, versaoLida });
      } catch {
        toast.error("Não foi possível salvar o alinhamento. Confira a conexão e tente de novo.");
        return;
      }
      if (!r.ok) {
        // A sessão continua. Na trava, o aviso fica na barra do alinhamento com a saída ("Manter o meu").
        if (r.error === MOTIVO_CORRIDA_ALINHAMENTO) setCorrida("aviso");
        else toast.error(r.error);
        return;
      }
      setRecemSalvos((a) => ({ ...a, [chaveAlinhamento(camadaId, formato)]: atual }));
      setCorrida(null);
      setSessao(null);
      toast.success("Alinhamento salvo.");
      router.refresh();
    });
  }

  function confirmarCamada(camadaId: string) {
    const c = camadas.find((x) => x.id === camadaId);
    const al = c?.alinhamentos[c.formato];
    if (!c || !al) return;
    start(async () => {
      const r = await confirmarAlinhamento({ camadaId, formato: c.formato, versaoLida: al.versao }).catch(() => null);
      if (r?.ok) toast.success("Alinhamento conferido.");
      else toast.error(r ? r.error : "Não foi possível conferir o alinhamento. Confira a conexão.");
      // Também na trava: a cena recarregada traz o alinhamento que a outra pessoa gravou.
      router.refresh();
    });
  }

  // Atalhos do alinhamento: setas deslocam, Ctrl+Z desfaz, Esc descarta os cliques do par.
  const emSessao = sessao !== null;
  useEffect(() => {
    if (!emSessao) return;
    function aoTeclar(ev: KeyboardEvent) {
      if (!atalhoNoEvento(ev)) return;
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
      if (modo === "cruzamentos") desenharCruzamentos(ctx, vista, caixasCruzamento);
      desenharPinos(ctx, vista, pinos);
      if (pontoApontar) desenharMira(ctx, vista, pontoApontar);
      if (sessao && sessao.cliques.length > 0) desenharMarcadores(ctx, vista, sessao, corAlinhando);
    },
    [modo, caixasCruzamento, pinos, pontoApontar, sessao, corAlinhando],
  );

  // Clique no desenho: alinhando = ponto do par; apontando = ponto da interferência; senão, abre o pino clicado.
  const aoPontoMundo = useMemo(() => {
    if (sessao) {
      if (sessao.modo === "ajuste") return undefined;
      return (p: Ponto) => {
        const r = clicar(sessao, p);
        setSessao(r.sessao);
        if (r.erro) toast.error(r.erro);
      };
    }
    if (apontando) return (p: Ponto) => setPontoApontar(p);
    if (pinos.length === 0) return undefined;
    return (p: Ponto) => {
      const escala = palcoRef.current?.escalaVista() ?? 1;
      const alvo = pinoMaisProximo(pinos, p, RAIO_CLIQUE_PINO / escala);
      if (alvo) router.push(hrefDoPino(cena.projetoId, alvo));
    };
  }, [sessao, apontando, pinos, router, cena.projetoId]);

  async function apontar(dados: DadosApontamento): Promise<string | null> {
    const ponto = pontoApontar;
    const c = camadas.find((x) => x.id === dados.camadaId);
    if (!ponto || !c) return "Escolha a disciplina que deve alterar.";
    const motivo = motivoParaNaoApontar(c);
    if (motivo) return motivo.erro;
    const pdf = c.pdf!;
    const alinhamentoPdf = c.alinhamentos.pdf!.alinhamento;
    let tamanho;
    try {
      tamanho = await tamanhoDaPagina(pdf.uploadId, c.pagina);
    } catch {
      return "Não foi possível abrir o PDF desta prancha.";
    }
    const destino = pinoDoApontamento(c, alinhamentoPdf, ponto, tamanho);
    if (!destino.ok) return destino.erro;

    const r = await criarPendencia({
      uploadId: destino.uploadId,
      pagina: destino.pagina,
      x: destino.x,
      y: destino.y,
      texto: dados.texto,
      severidade: dados.severidade,
      tipo: dados.tipo,
    });
    if (!r.ok) return r.error;

    // A imagem de contexto é um extra: falhar nela não desfaz o apontamento.
    let anexou = false;
    try {
      const imagem = await palcoRef.current?.paraImagem(ponto, RECORTE_CONTEXTO.largura, RECORTE_CONTEXTO.altura);
      if (imagem) {
        const form = new FormData();
        form.set("pendenciaId", r.data.id);
        form.set("file", new File([imagem], `sobreposicao-${r.data.numero}.png`, { type: "image/png" }));
        const res = await fetch("/api/pendencias/anexo", { method: "POST", body: form });
        anexou = res.ok;
      }
    } catch (erro) {
      console.error("[sobreposicao] falha ao anexar a imagem do apontamento:", erro);
    }
    if (anexou) toast.success(`Apontamento #${r.data.numero} criado em ${c.disciplina}, como rascunho.`);
    else toast.error(MENSAGEM_SEM_IMAGEM);

    setPontoApontar(null);
    setApontando(false);
    router.refresh();
    return null;
  }

  const modoSessao = sessao?.modo;
  const aoArrastarCamada = useMemo(() => {
    if (modoSessao !== "ajuste") return undefined;
    return (d: Ponto, inicio: boolean) => setSessao((s) => s && deslocar(s, d, inicio));
  }, [modoSessao]);

  useEffect(() => {
    if (!apontando || pontoApontar) return;
    function aoTeclar(ev: KeyboardEvent) {
      if (ev.key === "Escape" && atalhoNoEvento(ev)) setApontando(false);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [apontando, pontoApontar]);

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
  // Nada a desenhar e nada carregando: todas as camadas estão desligadas, sem arquivo ou com erro.
  const nadaDesenhado = noPalco.length === 0 && !carregando;
  const cruzamentoCarregando =
    modo === "cruzamentos" && [cruzA, cruzB].some((id) => id !== null && estados[id]?.tipo === "carregando");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="md:hidden" onClick={() => setGaveta(true)}>
          <Layers className="size-4" />
          Camadas
        </Button>
        <Tabs value={modo} onValueChange={(v) => v && setModo(v as Modo)}>
          <TabsList>
            <TabsTrigger value="sobrepor">Sobrepor</TabsTrigger>
            <TabsTrigger value="cortina" disabled={sessao !== null || !baseId || !primeiraOutra}>
              Cortina
            </TabsTrigger>
            <TabsTrigger value="cruzamentos" disabled={sessao !== null || camadas.length < 2}>
              Cruzamentos
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {modo === "cortina" && (
          <SeletorCamada
            rotulo="Camada da cortina"
            valor={camadaCortina}
            camadas={camadas.filter((c) => !c.base)}
            onValor={setCortinaId}
          />
        )}
        {modo === "cruzamentos" && (
          <>
            <SeletorCamada
              rotulo="Primeira camada"
              valor={cruzA}
              camadas={camadas}
              onValor={(id) => setParCruzamento([id, cruzB])}
            />
            <SeletorCamada
              rotulo="Segunda camada"
              valor={cruzB}
              camadas={camadas}
              onValor={(id) => setParCruzamento([cruzA, id])}
            />
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {cruzA === cruzB
                ? "Escolha duas camadas diferentes."
                : cruzamentoCarregando
                  ? "Carregando as plantas…"
                  : caixasCruzamento.length === 0
                  ? "Nenhum cruzamento"
                  : caixasCruzamento.length === 1
                    ? "1 cruzamento"
                    : `${caixasCruzamento.length} cruzamentos`}
            </span>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {cena.podeApontar && !sessao && (
            <Button
              type="button"
              size="sm"
              variant={apontando ? "default" : "outline"}
              aria-pressed={apontando}
              onClick={() => setApontando((a) => !a)}
            >
              <MapPin className="size-4" />
              Apontar interferência
            </Button>
          )}
          {cena.podeGerir && !sessao && !apontando && (
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
          <span className="text-xs tabular-nums text-muted-foreground">
            <span className="sr-only">Zoom </span>
            {zoom}%
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => palcoRef.current?.ajustar()}>
            <Maximize className="size-4" />
            Ajustar à tela
          </Button>
        </div>
      </div>

      {apontando && !sessao && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">Clique no ponto da interferência no desenho.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setApontando(false)}>
            Cancelar
          </Button>
        </div>
      )}

      {!sessao && <RascunhosPainel grupos={rascunhos} />}

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
          corrida={corrida}
          onManterMeu={() => {
            setCorrida("atualizando");
            router.refresh();
          }}
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
            cortina={cortinaNoPalco}
            onVistaAssentou={modo === "cruzamentos" ? () => setVistaAssentou((n) => n + 1) : undefined}
            arrastarCamada={aoArrastarCamada}
            ajustarNoDuploClique={!sessao && !apontando}
            sobreposto={desenharPorCima}
            className={
              sessao ? (sessao.modo === "ajuste" ? "cursor-move" : "cursor-crosshair") : apontando ? "cursor-crosshair" : undefined
            }
          />
          {cortinaNoPalco && (
            <CortinaDivisor
              corte={corte}
              onCorte={setCorte}
              rotuloEsquerda={nome(cortinaNoPalco.baseId)}
              rotuloDireita={nome(cortinaNoPalco.camadaId)}
            />
          )}
          {carregando && (
            <div
              role="status"
              className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Carregando as plantas…
              </span>
            </div>
          )}
          {nadaDesenhado && (
            <div
              role="status"
              className="pointer-events-none absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground"
            >
              Nenhuma camada pode ser desenhada agora. Veja os avisos em Camadas.
            </div>
          )}
        </div>
      </div>

      <ApontarDialog
        aberto={pontoApontar !== null}
        onOpenChange={(aberto) => !aberto && setPontoApontar(null)}
        camadas={camadas.filter((c) => c.visivel)}
        onUsarPdf={(id) => rodar(() => atualizarCamada({ camadaId: id, formato: "pdf" }), "Camada em PDF.")}
        onConfirmar={apontar}
      />

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
