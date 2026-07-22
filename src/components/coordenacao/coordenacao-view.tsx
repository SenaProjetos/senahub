"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Send, Move3d } from "lucide-react";
import type {
  ViewerEngine,
  SelecaoInfo,
  CorteConfig,
  CameraApontamento,
} from "@/modules/coordenacao/viewer/engine";
import type { ApontamentoView } from "@/modules/coordenacao/queries";
import {
  criarApontamentoCoordenacao,
  editarApontamentoCoordenacao,
  excluirApontamentoCoordenacao,
  resolverApontamentoCoordenacao,
  reabrirApontamentoCoordenacao,
  fecharApontamentoCoordenacao,
  descartarApontamentoCoordenacao,
  enviarApontamentosCoordenacao,
  realinharModeloIfc,
} from "@/modules/coordenacao/actions";
import { enviaveis as apontamentosEnviaveis } from "@/modules/coordenacao/helpers";
import { type ModeloRow } from "@/components/coordenacao/conversao-status-view";
import { ArvoreModelo } from "@/components/coordenacao/arvore-modelo";
import { MedicaoToolbar } from "@/components/coordenacao/medicao-toolbar";
import { PainelDisciplinas } from "@/components/coordenacao/painel-disciplinas";
import { PainelPropriedades } from "@/components/coordenacao/painel-propriedades";
import { RealinharIfcDialog } from "@/components/coordenacao/realinhar-ifc-dialog";
import { ViewerToolbar } from "@/components/coordenacao/viewer-toolbar";
import { ApontamentoPins } from "@/components/coordenacao/apontamento-pins";
import { ApontamentosLista } from "@/components/coordenacao/apontamentos-lista";
import { ApontamentoForm, type ApontamentoDraft } from "@/components/coordenacao/apontamento-form";
import { TarefaDialog, type OpcoesUI } from "@/components/tarefas/tarefa-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Todo o stack 3D (three + @thatopen/fragments) fica atrás deste dynamic import:
// só baixa ao abrir a aba Coordenação, e nunca roda no servidor.
const Viewer3D = dynamic(() => import("@/components/coordenacao/viewer-3d"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

type DraftInfo = { uploadId: string; disciplinaId: string | null; guids: string[]; camera: CameraApontamento };

/** Viewer federado + apontamentos de compatibilização. Nada carrega por padrão. */
export function CoordenacaoView({
  modelos,
  apontamentosIniciais,
  projetoId,
  projetoCodigo,
  projetoNome,
  currentUserId,
  ehAdmin,
  podeGerir,
  minhasDisciplinas,
  colunasTarefa,
  opcoesTarefa,
  apontamentoInicialNumero,
}: {
  modelos: ModeloRow[];
  apontamentosIniciais: ApontamentoView[];
  projetoId: string;
  projetoCodigo: string;
  projetoNome: string;
  currentUserId: string;
  ehAdmin: boolean;
  podeGerir: boolean;
  minhasDisciplinas: string[];
  colunasTarefa: { id: string; nome: string }[];
  opcoesTarefa: OpcoesUI | null;
  apontamentoInicialNumero: number | null;
}) {
  const router = useRouter();
  const engineRef = useRef<ViewerEngine | null>(null);
  const [carregados, setCarregados] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState<Set<string>>(new Set());
  const [selecao, setSelecao] = useState<SelecaoInfo | null>(null);
  const [temSelecao, setTemSelecao] = useState(false);
  const [corte, setCorte] = useState<CorteConfig>(null);

  const [apontamentos, setApontamentos] = useState<ApontamentoView[]>(apontamentosIniciais);
  const [apontamentoSelecionadoId, setApontamentoSelecionadoId] = useState<string | null>(null);
  const [draftAberto, setDraftAberto] = useState(false);
  const [draftInfo, setDraftInfo] = useState<DraftInfo | null>(null);
  const [editando, setEditando] = useState<ApontamentoView | null>(null);
  const [enviarAberto, setEnviarAberto] = useState(false);
  const [selecaoExport, setSelecaoExport] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const minhasDisciplinasSet = useMemo(() => new Set(minhasDisciplinas), [minhasDisciplinas]);

  // ── Realinhamento (offset de IFC) ──
  const [realinharAberto, setRealinharAberto] = useState(false);
  const [realinharUploadId, setRealinharUploadId] = useState<string | null>(null);
  const [vetorRealinhar, setVetorRealinhar] = useState<[number, number, number]>([0, 0, 0]);
  const [enviandoAvulso, setEnviandoAvulso] = useState(false);
  // Após aplicar: espera a nova versão converter e a troca na cena (novo entra, antigo sai).
  const [trocaPendente, setTrocaPendente] = useState<{ antigo: string; novo: string } | null>(null);

  // Só modelos já convertidos (têm .frag) entram em realinhamento — precisam da prévia.
  const modelosRealinhaveis = useMemo(
    () =>
      modelos
        .filter((m) => m.conversao?.status === "concluido")
        .map((m) => ({
          uploadId: m.uploadId,
          nomeArquivo: m.nomeArquivo,
          disciplinaNome: m.disciplinaNome,
          versao: m.versao,
        })),
    [modelos],
  );

  // Disciplinas onde o usuário pode enviar um IFC avulso (responsável, ou admin em todas).
  const disciplinasUpload = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of modelos) {
      if (!row.disciplinaId) continue; // recebidos (sem disciplina) não são destino de upload avulso
      if (ehAdmin || minhasDisciplinasSet.has(row.disciplinaId)) m.set(row.disciplinaId, row.disciplinaNome);
    }
    return [...m].map(([id, nome]) => ({ id, nome }));
  }, [modelos, ehAdmin, minhasDisciplinasSet]);

  const disciplinaDoUpload = useMemo(() => {
    const m = new Map<string, { id: string; nome: string }>();
    for (const row of modelos) m.set(row.uploadId, { id: row.disciplinaId, nome: row.disciplinaNome });
    return m;
  }, [modelos]);

  // Modelos carregados na cena, com rótulo — alimenta a árvore de elementos (Onda 0).
  const modelosCarregadosInfo = useMemo(
    () =>
      modelos
        .filter((m) => carregados.has(m.uploadId))
        .map((m) => ({ uploadId: m.uploadId, label: `${m.disciplinaNome} · ${m.nomeArquivo}` })),
    [modelos, carregados],
  );

  const onReady = useCallback((engine: ViewerEngine) => {
    engineRef.current = engine;
  }, []);

  const onSelecionarViewer = useCallback((info: SelecaoInfo | null) => {
    setSelecao(info);
    setTemSelecao(engineRef.current?.temSelecao ?? false);
  }, []);

  const onToggle = useCallback(async (uploadId: string, ligar: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!ligar) {
      await engine.descarregarModelo(uploadId);
      setCarregados((s) => {
        const n = new Set(s);
        n.delete(uploadId);
        return n;
      });
      // Desligou a disciplina em destaque → limpa o destaque.
      if (foco === uploadId) {
        setFoco(null);
        void engine.destacarModelo(null);
      }
      return;
    }
    if (carregados.has(uploadId)) return;
    setCarregando((s) => new Set(s).add(uploadId));
    try {
      await engine.carregarModelo(uploadId, `/api/coordenacao/frag/${uploadId}`);
      setCarregados((s) => new Set(s).add(uploadId));
      // Modelo novo entrando com um destaque ativo → aplica o ghost nele também.
      if (foco) void engine.destacarModelo(foco);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar o modelo.");
    } finally {
      setCarregando((s) => {
        const n = new Set(s);
        n.delete(uploadId);
        return n;
      });
    }
  }, [carregados, foco]);

  const aplicarCorte = useCallback((config: CorteConfig) => {
    setCorte(config);
    engineRef.current?.definirCorte(config);
  }, []);

  const focar = useCallback(
    (uploadId: string) => {
      const novo = foco === uploadId ? null : uploadId;
      setFoco(novo);
      void engineRef.current?.destacarModelo(novo);
    },
    [foco],
  );

  // ── Realinhamento: escolher modelo, mexer no vetor, aplicar ──

  const escolherRealinhar = useCallback(
    async (uploadId: string) => {
      if (!carregados.has(uploadId)) await onToggle(uploadId, true);
      const engine = engineRef.current;
      if (!engine) return;
      const inicial: [number, number, number] = [0, 0, 0];
      setVetorRealinhar(inicial);
      setRealinharUploadId(uploadId);
      engine.entrarRealinhamento(uploadId, inicial, (v) => setVetorRealinhar(v));
    },
    [carregados, onToggle],
  );

  const mudarVetorRealinhar = useCallback((v: [number, number, number]) => {
    setVetorRealinhar(v);
    engineRef.current?.definirVetorRealinhamento(v);
  }, []);

  // Volta ao seletor de modelo (sai do modo do engine) mantendo o painel aberto.
  const trocarRealinhar = useCallback(() => {
    engineRef.current?.sairRealinhamento();
    setRealinharUploadId(null);
    setVetorRealinhar([0, 0, 0]);
  }, []);

  const fecharRealinhar = useCallback(() => {
    engineRef.current?.sairRealinhamento();
    setRealinharUploadId(null);
    setVetorRealinhar([0, 0, 0]);
    setRealinharAberto(false);
  }, []);

  function aplicarRealinhar() {
    if (!realinharUploadId) return;
    const antigo = realinharUploadId;
    const [dx, dy, dz] = vetorRealinhar;
    start(async () => {
      const r = await realinharModeloIfc({ uploadId: antigo, dx, dy, dz });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `IFC realinhado — nova versão v${r.data.versao} gerada. Assim que a prévia converter, ela troca sozinha na cena.`,
      );
      // Marca a troca: quando a nova versão terminar de converter (o painel de status
      // faz polling e revalida), o efeito abaixo carrega a nova e descarrega a antiga.
      setTrocaPendente({ antigo, novo: r.data.uploadId });
      fecharRealinhar();
      router.refresh();
    });
  }

  // Troca automática pós-realinhamento: assim que a nova versão aparecer convertida na
  // lista (via polling/revalidação do painel de status), carrega-a na cena e remove a
  // versão antiga — sem o usuário precisar atualizar a página nem religar o modelo.
  useEffect(() => {
    if (!trocaPendente) return;
    const novoRow = modelos.find((m) => m.uploadId === trocaPendente.novo);
    if (novoRow?.conversao?.status !== "concluido") return; // ainda na fila/processando
    const engine = engineRef.current;
    if (!engine) return;

    let cancelado = false;
    void (async () => {
      try {
        if (!carregados.has(trocaPendente.novo)) {
          await engine.carregarModelo(trocaPendente.novo, `/api/coordenacao/frag/${trocaPendente.novo}`);
          if (cancelado) return;
          setCarregados((s) => new Set(s).add(trocaPendente.novo));
        }
        if (carregados.has(trocaPendente.antigo)) {
          await engine.descarregarModelo(trocaPendente.antigo);
          setCarregados((s) => {
            const n = new Set(s);
            n.delete(trocaPendente.antigo);
            return n;
          });
          if (foco === trocaPendente.antigo) setFoco(null);
        }
        if (!cancelado) {
          toast.success("Nova versão realinhada carregada na cena.");
          setTrocaPendente(null);
        }
      } catch (err) {
        if (!cancelado) {
          toast.error(err instanceof Error ? err.message : "Falha ao carregar a nova versão.");
          setTrocaPendente(null);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [modelos, trocaPendente, carregados, foco]);

  function enviarAvulso(file: File, disciplinaId: string) {
    setEnviandoAvulso(true);
    void (async () => {
      try {
        const fd = new FormData();
        fd.append("disciplinaId", disciplinaId);
        fd.append("pacote", "RECEBIDOS");
        fd.append("files", file, file.name);
        const resp = await fetch("/api/uploads", { method: "POST", body: fd });
        const j = (await resp.json().catch(() => null)) as
          | { error?: string; resultados?: { ok: boolean; motivo?: string }[] }
          | null;
        const res0 = j?.resultados?.[0];
        if (!resp.ok || res0?.ok === false) {
          toast.error(res0?.motivo ?? j?.error ?? "Falha ao enviar o IFC.");
          return;
        }
        toast.success("IFC enviado. Quando a conversão terminar, ligue a disciplina e selecione o modelo para realinhar.");
        router.refresh();
      } catch {
        toast.error("Falha ao enviar o IFC.");
      } finally {
        setEnviandoAvulso(false);
      }
    })();
  }

  // ── Criar apontamento (a partir da seleção atual do viewer) ──

  function abrirNovoApontamento() {
    const engine = engineRef.current;
    if (!engine || !engine.temSelecao) return;
    const modeloId = engine.modeloPrimarioDaSelecao();
    const disciplina = modeloId ? disciplinaDoUpload.get(modeloId) : null;
    if (!modeloId || !disciplina) {
      toast.error("Não foi possível identificar o modelo da seleção.");
      return;
    }
    start(async () => {
      const guids = await engine.guidsDaSelecao();
      const camera = engine.capturarCamera();
      // Recebido do cliente não tem disciplina (id vazio) → apontamento sem disciplina.
      setDraftInfo({ uploadId: modeloId, disciplinaId: disciplina.id || null, guids, camera });
      setDraftAberto(true);
    });
  }

  function salvarNovoApontamento(draft: ApontamentoDraft) {
    if (!draftInfo) return;
    start(async () => {
      const r = await criarApontamentoCoordenacao({
        projetoId,
        disciplinaId: draftInfo.disciplinaId ?? undefined,
        uploadId: draftInfo.uploadId,
        titulo: draft.titulo,
        texto: draft.texto,
        guids: draftInfo.guids,
        camera: draftInfo.camera,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const disciplina = disciplinaDoUpload.get(draftInfo.uploadId);
      const novo: ApontamentoView = {
        id: r.data.id,
        numero: r.data.numero,
        disciplinaId: draftInfo.disciplinaId,
        disciplinaNome: disciplina?.nome ?? "—",
        uploadId: draftInfo.uploadId,
        titulo: draft.titulo,
        texto: draft.texto,
        guids: draftInfo.guids,
        camera: draftInfo.camera,
        snapshotPath: null,
        status: "aberta",
        autorId: currentUserId,
        autor: "Você",
        tarefaId: null,
        createdAt: new Date().toISOString(),
      };
      setApontamentos((as) => [...as, novo]);
      setApontamentoSelecionadoId(novo.id);
      setDraftAberto(false);
      setDraftInfo(null);
      toast.success(`Apontamento #${novo.numero} criado.`);

      // Snapshot: melhor esforço — falha aqui não invalida o apontamento já criado.
      const blob = await engineRef.current?.capturarSnapshot().catch(() => null);
      if (blob) {
        const fd = new FormData();
        fd.append("apontamentoId", r.data.id);
        fd.append("file", blob, "snapshot.png");
        await fetch("/api/coordenacao/snapshot", { method: "POST", body: fd }).catch(() => {});
      }
    });
  }

  function salvarEdicao(draft: ApontamentoDraft) {
    if (!editando) return;
    start(async () => {
      const r = await editarApontamentoCoordenacao({ id: editando.id, titulo: draft.titulo, texto: draft.texto });
      if (r.ok) {
        setApontamentos((as) => as.map((a) => (a.id === editando.id ? { ...a, ...draft } : a)));
        setEditando(null);
        toast.success("Apontamento atualizado.");
      } else toast.error(r.error);
    });
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirApontamentoCoordenacao({ id });
      if (r.ok) {
        setApontamentos((as) => as.filter((a) => a.id !== id));
        toast.success("Apontamento excluído.");
      } else toast.error(r.error);
    });
  }

  function mudarStatus(
    id: string,
    fn: (i: { id: string }) => Promise<{ ok: boolean; error?: string }>,
    novo: string,
    msg: string,
  ) {
    start(async () => {
      const r = await fn({ id });
      if (r.ok) {
        setApontamentos((as) => as.map((a) => (a.id === id ? { ...a, status: novo } : a)));
        toast.success(msg);
      } else toast.error(r.error ?? "Erro.");
    });
  }

  // ── Abrir apontamento (lista ou pin): restaura câmera + seleção ──

  const abrirApontamento = useCallback(
    async (a: ApontamentoView) => {
      setApontamentoSelecionadoId(a.id);
      if (!carregados.has(a.uploadId)) await onToggle(a.uploadId, true);
      await engineRef.current?.restaurarCamera(a.camera);
      await engineRef.current?.selecionarPorGuids(a.guids);
    },
    [carregados, onToggle],
  );

  // Deep-link ?apontamento=N — roda uma vez, assim que o engine fica pronto.
  const deepLinkAplicado = useRef(false);
  const onEngineReadyEfeito = useCallback(
    (engine: ViewerEngine) => {
      onReady(engine);
      if (apontamentoInicialNumero && !deepLinkAplicado.current) {
        const alvo = apontamentosIniciais.find((a) => a.numero === apontamentoInicialNumero);
        if (alvo) {
          deepLinkAplicado.current = true;
          void abrirApontamento(alvo);
        }
      }
    },
    [onReady, apontamentoInicialNumero, apontamentosIniciais, abrirApontamento],
  );

  // ── Enviar (agrupa abertos sem tarefa em UMA Tarefa) ──

  const listaEnviaveis = apontamentosEnviaveis(apontamentos);

  function aplicarEnvio(data: { tarefaId: string; total: number }) {
    setApontamentos((as) =>
      as.map((a) => (a.status === "aberta" && !a.tarefaId ? { ...a, tarefaId: data.tarefaId } : a)),
    );
    toast.success(`Tarefa criada com ${data.total} apontamento(s).`);
  }

  function enviar() {
    if (listaEnviaveis.length === 0) return;
    if (!opcoesTarefa) {
      start(async () => {
        const r = await enviarApontamentosCoordenacao({ projetoId });
        if (r.ok) aplicarEnvio(r.data);
        else toast.error(r.error);
      });
      return;
    }
    setEnviarAberto(true);
  }

  async function submeterEnvio(payload: {
    titulo: string;
    descricao: string;
    statusId: string;
    prazo: string;
    prioridade: string;
    responsaveisIds: string[];
    dependeDeIds: string[];
  }): Promise<boolean> {
    const r = await enviarApontamentosCoordenacao({
      projetoId,
      titulo: payload.titulo,
      descricao: payload.descricao,
      statusId: payload.statusId,
      prazo: payload.prazo,
      prioridade: payload.prioridade,
      responsaveisIds: payload.responsaveisIds,
      dependeDeIds: payload.dependeDeIds,
    });
    if (r.ok) {
      aplicarEnvio(r.data);
      return true;
    }
    toast.error(r.error);
    return false;
  }

  function toggleExport(id: string) {
    setSelecaoExport((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selecionarTodosExport(marcar: boolean) {
    setSelecaoExport(marcar ? new Set(apontamentos.map((a) => a.id)) : new Set());
  }

  function exportarBcf() {
    if (selecaoExport.size === 0) return;
    setExportando(true);
    // Download direto pela rota autenticada (streaming do .bcfzip).
    const ids = [...selecaoExport].join(",");
    const url = `/api/coordenacao/bcf?projeto=${encodeURIComponent(projetoId)}&ids=${encodeURIComponent(ids)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Sem readback do stream: solta o estado após um instante (o browser assume o download).
    window.setTimeout(() => setExportando(false), 1500);
    toast.success(`Exportando ${selecaoExport.size} apontamento(s) em BCF…`);
  }

  const pins = apontamentos.map((a) => ({
    id: a.id,
    numero: a.numero,
    uploadId: a.uploadId,
    guids: a.guids,
    status: a.status,
  }));

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="relative h-[70vh] min-h-[420px] flex-1 overflow-hidden rounded-lg border bg-muted/20">
        <ViewerToolbar
          temSelecao={temSelecao}
          corte={corte}
          onEnquadrar={() => void engineRef.current?.enquadrar()}
          onCorte={aplicarCorte}
          onIsolar={() => void engineRef.current?.isolarSelecao()}
          onOcultar={() => void engineRef.current?.ocultarSelecao()}
          onMostrarTudo={() => void engineRef.current?.mostrarTudo()}
          onLimparSelecao={() => void engineRef.current?.limparSelecao()}
        />
        {podeGerir && (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={realinharAberto || pending} onClick={() => setRealinharAberto(true)} className="gap-1">
              <Move3d className="size-4" /> Realinhar
            </Button>
            <Button size="sm" variant="secondary" disabled={!temSelecao || pending} onClick={abrirNovoApontamento} className="gap-1">
              <MapPin className="size-4" /> Novo apontamento
            </Button>
            <Button size="sm" disabled={listaEnviaveis.length === 0 || pending} onClick={enviar} className="gap-1">
              <Send className="size-4" /> Enviar {listaEnviaveis.length > 0 && `(${listaEnviaveis.length})`}
            </Button>
          </div>
        )}
        <Viewer3D onReady={onEngineReadyEfeito} onSelecionar={onSelecionarViewer} />
        <ApontamentoPins
          engine={engineRef.current}
          pins={pins}
          carregados={carregados}
          selecionadoId={apontamentoSelecionadoId}
          onClickPin={(id) => {
            const a = apontamentos.find((x) => x.id === id);
            if (a) void abrirApontamento(a);
          }}
        />
        {carregados.size === 0 && carregando.size === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-md bg-background/80 px-4 py-2 text-sm text-muted-foreground backdrop-blur">
              Ligue uma disciplina no painel ao lado para carregar a maquete.
            </p>
          </div>
        )}
        {podeGerir && (
          <RealinharIfcDialog
            aberto={realinharAberto}
            onFechar={fecharRealinhar}
            onTrocar={trocarRealinhar}
            modelos={modelosRealinhaveis}
            uploadIdAtivo={realinharUploadId}
            onEscolher={(id) => void escolherRealinhar(id)}
            vetor={vetorRealinhar}
            onVetor={mudarVetorRealinhar}
            onAplicar={aplicarRealinhar}
            pending={pending}
            disciplinasUpload={disciplinasUpload}
            onEnviarAvulso={enviarAvulso}
            enviandoAvulso={enviandoAvulso}
          />
        )}
        <MedicaoToolbar engine={engineRef.current} />
      </div>
      <aside className="w-full shrink-0 space-y-4 lg:w-80">
        <PainelDisciplinas
          modelos={modelos}
          carregados={carregados}
          carregando={carregando}
          foco={foco}
          onToggle={onToggle}
          onFocar={focar}
        />
        <ArvoreModelo engine={engineRef.current} modelos={modelosCarregadosInfo} />
        <ApontamentosLista
          apontamentos={apontamentos}
          selecionadoId={apontamentoSelecionadoId}
          currentUserId={currentUserId}
          ehAdmin={ehAdmin}
          podeGerir={podeGerir}
          minhasDisciplinas={minhasDisciplinasSet}
          pending={pending}
          selecaoExport={selecaoExport}
          exportando={exportando}
          onToggleExport={toggleExport}
          onSelecionarTodos={selecionarTodosExport}
          onExportar={exportarBcf}
          onSelecionar={(a) => void abrirApontamento(a)}
          onEditar={setEditando}
          onExcluir={excluir}
          onResolver={(id) => mudarStatus(id, resolverApontamentoCoordenacao, "resolvida", "Marcado como resolvido.")}
          onReabrir={(id) => mudarStatus(id, reabrirApontamentoCoordenacao, "aberta", "Reaberto.")}
          onFechar={(id) => mudarStatus(id, fecharApontamentoCoordenacao, "fechada", "Apontamento fechado.")}
          onDescartar={(id) => mudarStatus(id, descartarApontamentoCoordenacao, "descartada", "Apontamento descartado.")}
        />
        {selecao && <PainelPropriedades selecao={selecao} />}
      </aside>

      <ApontamentoForm
        open={draftAberto}
        onOpenChange={(o) => {
          setDraftAberto(o);
          if (!o) setDraftInfo(null);
        }}
        modo="criar"
        elementosCount={draftInfo?.guids.length}
        pending={pending}
        onSalvar={salvarNovoApontamento}
      />
      <ApontamentoForm
        open={editando != null}
        onOpenChange={(o) => !o && setEditando(null)}
        modo="editar"
        valorInicial={editando ? { titulo: editando.titulo, texto: editando.texto } : undefined}
        pending={pending}
        onSalvar={salvarEdicao}
      />

      {opcoesTarefa && enviarAberto && (
        <TarefaDialog
          open={enviarAberto}
          onOpenChange={setEnviarAberto}
          tarefa={null}
          opcoes={opcoesTarefa}
          colunas={colunasTarefa}
          meId={currentUserId}
          meRole={ehAdmin ? "admin" : "supervisor"}
          tituloDialog="Confirmar tarefa de compatibilização"
          itensReadonly
          valoresIniciais={{
            titulo: `Compatibilização · ${projetoCodigo} — ${projetoNome}`,
            descricao: `${listaEnviaveis.length} apontamento(s) de coordenação.`,
          }}
          onSubmit={submeterEnvio}
        />
      )}
    </div>
  );
}
