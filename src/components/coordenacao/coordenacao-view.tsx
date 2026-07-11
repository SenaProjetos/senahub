"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { MapPin, Send } from "lucide-react";
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
} from "@/modules/coordenacao/actions";
import { enviaveis as apontamentosEnviaveis } from "@/modules/coordenacao/helpers";
import { type ModeloRow } from "@/components/coordenacao/conversao-status-view";
import { PainelDisciplinas } from "@/components/coordenacao/painel-disciplinas";
import { PainelPropriedades } from "@/components/coordenacao/painel-propriedades";
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

type DraftInfo = { uploadId: string; disciplinaId: string; guids: string[]; camera: CameraApontamento };

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
  const [pending, start] = useTransition();
  const minhasDisciplinasSet = useMemo(() => new Set(minhasDisciplinas), [minhasDisciplinas]);

  const disciplinaDoUpload = useMemo(() => {
    const m = new Map<string, { id: string; nome: string }>();
    for (const row of modelos) m.set(row.uploadId, { id: row.disciplinaId, nome: row.disciplinaNome });
    return m;
  }, [modelos]);

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
      return;
    }
    if (carregados.has(uploadId)) return;
    setCarregando((s) => new Set(s).add(uploadId));
    try {
      await engine.carregarModelo(uploadId, `/api/coordenacao/frag/${uploadId}`);
      setCarregados((s) => new Set(s).add(uploadId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar o modelo.");
    } finally {
      setCarregando((s) => {
        const n = new Set(s);
        n.delete(uploadId);
        return n;
      });
    }
  }, [carregados]);

  const aplicarCorte = useCallback((config: CorteConfig) => {
    setCorte(config);
    engineRef.current?.definirCorte(config);
  }, []);

  // ── Criar apontamento (a partir da seleção atual do viewer) ──

  function abrirNovoApontamento() {
    const engine = engineRef.current;
    if (!engine || !engine.temSelecao) return;
    const modeloId = engine.modeloPrimarioDaSelecao();
    const disciplina = modeloId ? disciplinaDoUpload.get(modeloId) : null;
    if (!modeloId || !disciplina) {
      toast.error("Não foi possível identificar a disciplina da seleção.");
      return;
    }
    start(async () => {
      const guids = await engine.guidsDaSelecao();
      const camera = engine.capturarCamera();
      setDraftInfo({ uploadId: modeloId, disciplinaId: disciplina.id, guids, camera });
      setDraftAberto(true);
    });
  }

  function salvarNovoApontamento(draft: ApontamentoDraft) {
    if (!draftInfo) return;
    start(async () => {
      const r = await criarApontamentoCoordenacao({
        projetoId,
        disciplinaId: draftInfo.disciplinaId,
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
      </div>
      <aside className="w-full shrink-0 space-y-4 lg:w-80">
        <PainelDisciplinas
          modelos={modelos}
          carregados={carregados}
          carregando={carregando}
          onToggle={onToggle}
        />
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
