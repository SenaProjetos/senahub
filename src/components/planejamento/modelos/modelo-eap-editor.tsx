"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, RotateCcw, Save } from "lucide-react";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import type { CalendarioGantt } from "@/modules/planejamento/gantt-escala";
import type { Vinculo } from "@/modules/planejamento/gantt-linhas";
import type { LinhaModelo } from "@/modules/planejamento/modelos/estrutura";
import {
  ACAO_ABRIR,
  ACAO_AVANCAR,
  ACAO_EXCLUIR,
  ACAO_INSERIR_ACIMA,
  ACAO_MOVER_BAIXO,
  ACAO_MOVER_CIMA,
  ACAO_RECUAR,
} from "@/modules/planejamento/acoes-eap";
import { itensDeLinhaModelo } from "@/modules/planejamento/modelos/acoes-modelo";
import {
  adicionarNoFim,
  avancar,
  definirPredecessoras,
  excluir,
  inserirAcima,
  mudarDuracao,
  mudarInformacoes,
  mover,
  moverNoNivel,
  recuar,
  renomear,
  type Edicao,
} from "@/modules/planejamento/modelos/edicao";
import { agendarModelo, linhasDoGantt } from "@/modules/planejamento/modelos/gantt-modelo";
import { editarEstruturaModeloEap } from "@/modules/planejamento/modelos/actions";
import { criarCalendario, diasUteisEntre, proximoDiaUtil, type Dia } from "@/lib/calendario-trabalho";
import { dataCurta } from "@/lib/dias-iso";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlanoGantt, type EdicaoDeCampo } from "@/components/planejamento/plano-gantt";

type Disciplina = { id: string; nome: string };
type Fase = { id: string; nome: string; sigla: string | null };

const selectCls =
  "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ROTULO_TIPO: Record<LinhaModelo["tipoEap"], string> = {
  fas: "Fase",
  disc: "Disciplina",
  res: "Agrupamento",
  atv: "Tarefa",
  mrc: "Marco",
};

/**
 * Editor do modelo de EAP (plano 2026-09-27-editar-modelo-eap): o MESMO `PlanoGantt` da EAP do projeto,
 * editando o JSON do modelo em memória. Cada mudança reagenda na hora (o motor roda aqui, M2); "Salvar"
 * grava o modelo inteiro (M1) com a versão que a tela abriu (M6). Sem `podeEditar`, o Gantt fica só de
 * leitura.
 */
export function ModeloEapEditor({
  modeloId,
  versao: versaoInicial,
  linhasIniciais,
  calendario,
  hoje,
  disciplinas,
  fases,
  podeEditar,
  verDatas,
}: {
  modeloId: string;
  /** `updatedAt` do modelo quando a página abriu. */
  versao: string;
  linhasIniciais: LinhaModelo[];
  calendario: CalendarioGantt;
  hoje: Dia;
  disciplinas: Disciplina[];
  fases: Fase[];
  podeEditar: boolean;
  /** Decisão #3: quem não vê datas do planejamento vê só a estrutura (sem gráfico, sem início/término). */
  verDatas: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [salvando, iniciar] = useTransition();
  const [linhas, setLinhas] = useState<LinhaModelo[]>(linhasIniciais);
  // As edições encadeadas (Tab/Enter na tabela) leem SEMPRE a última versão, não a do último render.
  const atual = useRef(linhasIniciais);
  const [gravadas, setGravadas] = useState(() => JSON.stringify(linhasIniciais));
  const [versao, setVersao] = useState(versaoInicial);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [novaLinhaId, setNovaLinhaId] = useState<string | null>(null);

  const cal = useMemo(() => criarCalendario({ diasSemana: calendario.diasUteis, feriados: calendario.feriados }), [calendario]);
  const [inicio, setInicio] = useState<Dia>(() => proximoDiaUtil(hoje, cal));

  const sujo = JSON.stringify(linhas) !== gravadas;
  const resultado = useMemo(() => agendarModelo(linhas, inicio, cal), [linhas, inicio, cal]);
  const nomes = useMemo(
    () => ({ disciplina: new Map(disciplinas.map((d) => [d.id, d.nome])), faseSigla: new Map(fases.map((f) => [f.id, f.sigla ?? f.nome])) }),
    [disciplinas, fases],
  );
  const tarefas = useMemo(() => linhasDoGantt(linhas, resultado, inicio, nomes), [linhas, resultado, inicio, nomes]);
  const fim = resultado.fimProjeto;

  // Sair (fechar a aba, recarregar) com alteração não salva pede confirmação do navegador.
  useEffect(() => {
    if (!sujo) return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [sujo]);

  /** Aplica uma edição pura; devolve o motivo quando ela não pode. */
  function mudar(fazer: (l: LinhaModelo[]) => Edicao & { novaId?: string }): string | null {
    const r = fazer(atual.current);
    if (!r.ok) return r.motivo;
    atual.current = r.linhas;
    setLinhas(r.linhas);
    if (r.novaId) setNovaLinhaId(r.novaId);
    return null;
  }

  function mudarOuAvisar(fazer: (l: LinhaModelo[]) => Edicao & { novaId?: string }) {
    const erro = mudar(fazer);
    if (erro) toast.error(erro);
  }

  function editarCampo(t: EapTarefaDTO, e: EdicaoDeCampo): Promise<string | null> {
    if (e.campo === "nome") return Promise.resolve(mudar((l) => renomear(l, t.id, e.nome)));
    if (e.campo === "duracao") return Promise.resolve(mudar((l) => mudarDuracao(l, t.id, { marco: e.marco, duracaoDias: e.duracaoDias })));
    return Promise.resolve("O modelo não tem % concluído — ele nasce em 0 no projeto.");
  }

  function editarPredecessoras(t: EapTarefaDTO, vinculos: Vinculo[]): Promise<string | null> {
    return Promise.resolve(mudar((l) => definirPredecessoras(l, t.id, vinculos)));
  }

  async function aoAcao(t: EapTarefaDTO, item: AcaoItemAcao) {
    // Confirma ANTES de mexer (e nada aqui passa por transição: confirm dentro de transição trava o React 19).
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar ?? "Confirmar",
        variant: item.variant === "destructive" ? "destructive" : undefined,
      });
      if (!ok) return;
    }
    switch (item.id) {
      case ACAO_ABRIR:
        setAbertaId(t.id);
        return;
      case ACAO_INSERIR_ACIMA:
        return mudarOuAvisar((l) => inserirAcima(l, t.id));
      case ACAO_RECUAR:
        return mudarOuAvisar((l) => recuar(l, t.id));
      case ACAO_AVANCAR:
        return mudarOuAvisar((l) => avancar(l, t.id));
      case ACAO_MOVER_CIMA:
        return mudarOuAvisar((l) => moverNoNivel(l, t.id, -1));
      case ACAO_MOVER_BAIXO:
        return mudarOuAvisar((l) => moverNoNivel(l, t.id, 1));
      case ACAO_EXCLUIR:
        return mudarOuAvisar((l) => excluir(l, t.id));
    }
  }

  function salvar() {
    const enviar = atual.current;
    iniciar(async () => {
      const r = await editarEstruturaModeloEap({ id: modeloId, versao, linhas: enviar });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setVersao(r.data.versao);
      setGravadas(JSON.stringify(enviar));
      toast.success("Modelo salvo.", { description: `${r.data.totalLinhas} linhas, ${r.data.totalMarcos} marcos.` });
      router.refresh();
    });
  }

  async function descartar() {
    const ok = await confirm({
      title: "Descartar as alterações?",
      description: "O modelo volta ao que está gravado. O que você mudou desde o último salvamento se perde.",
      confirmLabel: "Descartar",
      variant: "destructive",
    });
    if (!ok) return;
    const volta = JSON.parse(gravadas) as LinhaModelo[];
    atual.current = volta;
    setLinhas(volta);
  }

  const aberta = abertaId ? linhas.find((l) => l.id === abertaId) ?? null : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        {verDatas && (
          <div className="space-y-1">
            <Label htmlFor="modelo-inicio" className="text-xs text-muted-foreground">
              Início de referência
            </Label>
            <Input
              id="modelo-inicio"
              type="date"
              value={inicio}
              onChange={(e) => e.target.value && setInicio(proximoDiaUtil(e.target.value, cal))}
              className="h-8 w-40"
            />
          </div>
        )}
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          <strong className="text-foreground tabular-nums">{linhas.length}</strong> linhas ·{" "}
          <strong className="text-foreground tabular-nums">{linhas.filter((l) => l.tipoEap === "mrc").length}</strong> marcos
          {verDatas && fim && (
            <>
              {" "}· termina em <strong className="text-foreground">{dataCurta(fim)}</strong> (
              <span className="tabular-nums">{diasUteisEntre(inicio, fim, cal)}</span> dias úteis). As datas só mostram a forma
              do cronograma: no projeto, quem agenda é o motor.
            </>
          )}
        </p>
        {podeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            {sujo && <span className="text-xs font-medium text-warning">Alterações não salvas</span>}
            <Button type="button" variant="outline" size="sm" onClick={() => mudarOuAvisar(adicionarNoFim)}>
              <Plus className="size-3.5" /> Adicionar tarefa
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={!sujo || salvando} onClick={() => void descartar()}>
              <RotateCcw className="size-3.5" /> Descartar
            </Button>
            <Button type="button" size="sm" disabled={!sujo || salvando} onClick={salvar}>
              <Save className="size-3.5" /> {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        )}
      </div>

      <PlanoGantt
        tarefas={tarefas}
        modo="planejamento"
        calendario={calendario}
        verDatas={verDatas}
        mostrarCusto={false}
        hoje={hoje}
        filtroIds={null}
        onAbrir={podeEditar ? (t) => setAbertaId(t.id) : undefined}
        onEditarCampo={podeEditar ? editarCampo : undefined}
        onEditarPredecessoras={podeEditar ? editarPredecessoras : undefined}
        onErro={(mensagem) => toast.error(mensagem)}
        menuDe={(t, contexto) => itensDeLinhaModelo({ nome: t.nome, ehResumo: t.ehResumo, ...contexto }, { podeEditar, totalLinhas: linhas.length })}
        onAcao={(t, item) => void aoAcao(t, item)}
        onMover={podeEditar ? (t, alvoId, posicao) => mudarOuAvisar((l) => mover(l, t.id, alvoId, posicao)) : undefined}
        focoNomeId={novaLinhaId}
        onFocoConsumido={() => setNovaLinhaId(null)}
      />

      {aberta && (
        <InformacoesDaLinha
          key={aberta.id}
          linha={aberta}
          ehResumo={linhas.some((l) => l.parentId === aberta.id)}
          disciplinas={disciplinas}
          fases={fases}
          onFechar={() => setAbertaId(null)}
          onSalvar={(campos) => {
            const erro = mudar((l) => {
              let r: Edicao = renomear(l, aberta.id, campos.nome);
              if (r.ok && (campos.marco !== (aberta.tipoEap === "mrc") || campos.duracaoDias !== aberta.duracaoDias)) {
                r = mudarDuracao(r.linhas, aberta.id, { marco: campos.marco, duracaoDias: campos.marco ? undefined : campos.duracaoDias });
              }
              if (r.ok) {
                r = mudarInformacoes(r.linhas, aberta.id, {
                  disciplinaCatalogoId: campos.disciplinaCatalogoId,
                  etapaId: campos.etapaId,
                  deTerceiro: campos.deTerceiro,
                });
              }
              return r;
            });
            if (!erro) setAbertaId(null);
            return erro;
          }}
        />
      )}
    </div>
  );
}

type CamposDaLinha = {
  nome: string;
  marco: boolean;
  duracaoDias: number;
  disciplinaCatalogoId: string | null;
  etapaId: string | null;
  deTerceiro: boolean;
};

/** A janela da linha: o que a célula não edita (disciplina, fase, terceiro). Componente de topo (ADR-0002). */
function InformacoesDaLinha({
  linha,
  ehResumo,
  disciplinas,
  fases,
  onFechar,
  onSalvar,
}: {
  linha: LinhaModelo;
  ehResumo: boolean;
  disciplinas: Disciplina[];
  fases: Fase[];
  onFechar: () => void;
  /** Devolve o motivo quando não pôde aplicar; `null` = aplicou. */
  onSalvar: (campos: CamposDaLinha) => string | null;
}) {
  const [campos, setCampos] = useState<CamposDaLinha>({
    nome: linha.nome,
    marco: linha.tipoEap === "mrc",
    duracaoDias: linha.duracaoDias,
    disciplinaCatalogoId: linha.disciplinaCatalogoId,
    etapaId: linha.etapaId,
    deTerceiro: linha.deTerceiro,
  });
  const [erro, setErro] = useState<string | null>(null);
  const alternaMarco = !ehResumo && (linha.tipoEap === "atv" || linha.tipoEap === "mrc");

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Informações da tarefa</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="linha-nome">Nome</Label>
            <Input id="linha-nome" value={campos.nome} onChange={(e) => setCampos({ ...campos, nome: e.target.value })} autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="linha-duracao">Duração (dias úteis)</Label>
              <Input
                id="linha-duracao"
                type="number"
                min={1}
                max={9999}
                value={campos.marco ? 0 : campos.duracaoDias}
                disabled={campos.marco || ehResumo}
                onChange={(e) => setCampos({ ...campos, duracaoDias: Number(e.target.value) })}
              />
              {ehResumo && <p className="text-xs text-muted-foreground">Agrupamento: a duração vem das subtarefas.</p>}
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Tipo</span>
              {alternaMarco ? (
                <label className="flex h-9 items-center gap-2 text-sm">
                  <Checkbox checked={campos.marco} onCheckedChange={(v) => setCampos({ ...campos, marco: v === true })} />
                  Marco (duração zero)
                </label>
              ) : (
                <p className="flex h-9 items-center text-sm text-muted-foreground">{ehResumo ? "Agrupamento" : ROTULO_TIPO[linha.tipoEap]}</p>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="linha-disciplina">Disciplina</Label>
              <select
                id="linha-disciplina"
                className={selectCls}
                value={campos.disciplinaCatalogoId ?? ""}
                onChange={(e) => setCampos({ ...campos, disciplinaCatalogoId: e.target.value || null })}
              >
                <option value="">— nenhuma —</option>
                {disciplinas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linha-fase">Fase</Label>
              <select
                id="linha-fase"
                className={selectCls}
                value={campos.etapaId ?? ""}
                onChange={(e) => setCampos({ ...campos, etapaId: e.target.value || null })}
              >
                <option value="">— nenhuma —</option>
                {fases.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.sigla ? `${f.sigla} · ${f.nome}` : f.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Sem disciplina, a linha não herda o responsável nem fecha o marco da fase no projeto. Disciplina que o projeto não
            tem fica de fora ao aplicar o modelo, com tudo o que estiver dentro dela.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={campos.deTerceiro}
              onCheckedChange={(v) => setCampos({ ...campos, deTerceiro: v === true })}
            />
            <span>
              Etapa de terceiro
              <span className="block text-xs text-muted-foreground">Trabalho de fora da casa: segura prazo, mas não gera card nem cobra hora.</span>
            </span>
          </label>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => setErro(onSalvar(campos))}>
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
