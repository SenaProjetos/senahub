"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import {
  History,
  Users,
  GitBranch,
  FolderUp,
  Upload as UploadIcon,
  Download,
  Eye,
  FileArchive,
  FileText,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
  Link2,
  CheckCircle,
  XCircle,
  ListTodo,
  Plus,
  CalendarDays,
  NotebookPen,
  Unlock,
} from "lucide-react";
import {
  atualizarStatusDisciplina,
  reabrirDisciplina,
  definirResponsaveis,
  registrarRevisao,
} from "@/modules/projetos/actions";
import { rotuloCatalogo } from "@/modules/projetos/disciplina-rotulo";
import {
  solicitarAprovacaoDisciplina,
  confirmarAprovacaoDisciplina,
  recusarAprovacaoDisciplina,
} from "@/modules/projetos/aprovacao-disciplina/actions";
import {
  podeSolicitarAprovacao,
  podeConfirmarOuRecusarAprovacao,
  rotuloStatusDisciplina,
} from "@/modules/projetos/aprovacao-disciplina/regras";
import { ehGlobal } from "@/modules/projetos/diario/acesso";
import { DiarioEntradaDialog } from "@/components/projetos/diario-entrada-dialog";
import { DisciplinaEditDialog, DisciplinaDeleteButton } from "@/components/projetos/disciplina-edit-dialog";
import { validarEntrega, gerarAceiteCliente } from "@/modules/uploads/actions";
import { statusValidacao, entregaveisAtuais, type StatusValidacao } from "@/modules/uploads/validacao";
import { AcoesValidacaoArquivo } from "@/components/projetos/acoes-validacao-arquivo";
import { IconeArquivo, StatusArquivo, VersaoToggle } from "@/components/projetos/arquivos-explorer";
import { PastaTreeView, SeletorPasta, type ArquivoPasta } from "@/components/projetos/pasta-tree-view";
import type { PastaFlat } from "@/modules/projetos/pastas/arvore";
import { limiteDoPacote, limiteLabelDoPacote } from "@/modules/uploads/limites";
import { ratearPagamentoProjetista, bloqueioValorDisciplina } from "@/modules/uploads/rateio";
import {
  enviarArquivoComProgresso,
  patchLinhaEnvio,
  PainelProgressoEnvio,
  type LinhaEnvio,
} from "@/components/projetos/upload-progresso";
import {
  STATUS_LABEL,
  STATUS_TONE,
  transicaoDisciplinaPermitida,
  ETAPAS_DISCIPLINA,
  etapaDisciplina,
  rotuloEtapaDisciplina,
} from "@/modules/projetos/status";
import { prontidaoAprovacao } from "@/modules/projetos/prontidao";
import { diasDeAtraso } from "@/modules/projetos/atraso";
import type { StatusDisciplina } from "@/generated/prisma/client";
import { STATUS_DISCIPLINA } from "@/modules/projetos/schemas";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { TarefaDialog, type TarefaUI, type OpcoesUI } from "@/components/tarefas/tarefa-dialog";
import { PRIORIDADE_LABEL, PRIORIDADE_CLASS, ehPrioridade } from "@/modules/tarefas/prioridade";
import { Badge } from "@/components/ui/badge";
import { brl, formatarData, rotuloRevisao } from "@/lib/utils";

/** Tarefa da disciplina para a lista (formato do board + nome/cor/concluído do status). */
export type TarefaDaDisciplina = TarefaUI & { statusNome: string; statusCor: string | null; concluido: boolean };

/** Tarefa atrasada = tem prazo passado e não está numa coluna final. */
function tarefaAtrasada(t: TarefaDaDisciplina): boolean {
  if (!t.prazo || t.concluido) return false;
  return new Date(t.prazo) < new Date(new Date().toDateString());
}

type UploadItem = {
  id: string;
  pacote: "A" | "B" | "OUTROS" | "RECEBIDOS";
  nomeArquivo: string;
  versao: number;
  tamanho: number;
  validado: boolean;
  origem: "manual" | "ferramenta";
  ajusteObs: string | null;
  ajusteEm: string | null;
  autor: string;
  data: string;
  aceiteToken: string | null;
  aceiteSituacao: string | null;
};

type Disc = {
  id: string;
  nome: string;
  /** Nome no catálogo. Vira rótulo secundário só se diferir de `nome` — ver `rotuloCatalogo`. */
  catalogoNome?: string | null;
  status: StatusDisciplina;
  prazo: string | null;
  valor: number | null;
  responsaveis: { userId: string; name: string; role: string }[];
  ehResponsavel: boolean;
  revisoes: { id: string; numero: number; motivo: string | null; autor: string; data: string }[];
  uploads: UploadItem[];
  temA: boolean;
  temB: boolean;
  jaValidado: boolean;
  /** Já existe pagamento de projetista liberado para esta disciplina. */
  temPagamento: boolean;
  exigePacoteA: boolean;
  exigePacoteB: boolean;
  /** Aprovação/laudo (só projetos novos): árvore de pastas própria no lugar do pacote A/B. */
  usaPastas: boolean;
  pastas: PastaFlat[];
  arquivosPasta: ArquivoPasta[];
  aprovacaoSolicitadaEm: string | null;
  aprovacaoSolicitadaPorNome: string | null;
};

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DisciplinaCard({
  projetoId,
  disciplina,
  podeGerir,
  podeValidar,
  internos,
  canalChatId,
  tarefas,
  tarefaOpcoes,
  tarefaColunas,
  meId,
  meRole,
}: {
  projetoId: string;
  disciplina: Disc;
  podeGerir: boolean;
  podeValidar: boolean;
  internos: { id: string; name: string; role: string }[];
  canalChatId?: string;
  /** Tarefas desta disciplina (só p/ usuários internos); habilita o botão "Tarefas". */
  tarefas?: TarefaDaDisciplina[];
  tarefaOpcoes?: OpcoesUI;
  tarefaColunas?: { id: string; nome: string }[];
  meId?: string;
  meRole?: string;
}) {
  const [pending, start] = useTransition();
  const podeMexerStatus = podeGerir || disciplina.ehResponsavel;
  const podeEnviar = podeGerir || disciplina.ehResponsavel;
  const podeDiario = !!meRole && (ehGlobal(meRole) || disciplina.ehResponsavel);
  const atraso = diasDeAtraso(disciplina.prazo, disciplina.status);
  const rotulo = rotuloCatalogo(disciplina.nome, disciplina.catalogoNome);
  const qtdTarefas = tarefas?.length ?? 0;
  const qtdAtrasadas = tarefas?.filter(tarefaAtrasada).length ?? 0;
  // Fonte única do progresso de validação: o card e o dialog de arquivos leem o MESMO
  // objeto, senão o painel de conclusão e o botão do rodapé podem discordar.
  const stVal = statusValidacao(disciplina.uploads, {
    exigePacoteA: disciplina.exigePacoteA,
    exigePacoteB: disciplina.exigePacoteB,
  });

  function mudarStatus(status: string | null) {
    if (!status) return;
    start(async () => {
      const res = await atualizarStatusDisciplina({
        disciplinaId: disciplina.id,
        status: status as StatusDisciplina,
      });
      if (res.ok) toast.success("Status atualizado.");
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3 rounded-sm border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-semibold">
            {disciplina.nome}
            {rotulo && (
              <span
                className="text-xs font-normal text-muted-foreground"
                title={`Classificada no catálogo como ${rotulo}`}
              >
                · {rotulo}
              </span>
            )}
          </h4>
          {disciplina.prazo && (
            <p className="text-xs text-muted-foreground">
              Prazo: {formatarData(disciplina.prazo)}
            </p>
          )}
          {atraso > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="size-3.5" aria-hidden />
              atrasada {atraso}d
            </p>
          )}
          {qtdTarefas > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <ListTodo className="size-3.5" aria-hidden />
              {qtdTarefas} tarefa{qtdTarefas > 1 ? "s" : ""}
              {qtdAtrasadas > 0 && (
                <span className="font-medium text-destructive">
                  {" "}· {qtdAtrasadas} atrasada{qtdAtrasadas > 1 ? "s" : ""}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge tone={STATUS_TONE[disciplina.status] ?? "neutral"}>
            {rotuloStatusDisciplina({
              status: disciplina.status,
              aprovacaoSolicitadaEm: disciplina.aprovacaoSolicitadaEm,
            })}
          </StatusBadge>
          {canalChatId && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Abrir chat da disciplina"
              render={
                <Link
                  href={`/chat?c=${canalChatId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <MessageSquare className="size-3.5" />
            </Button>
          )}
          {podeGerir && (
            <>
              <DisciplinaEditDialog
                disciplinaId={disciplina.id}
                nome={disciplina.nome}
                prazo={disciplina.prazo}
                valor={disciplina.valor}
                responsaveisIds={disciplina.responsaveis.map((r) => r.userId)}
                internos={internos}
                exigePacoteA={disciplina.exigePacoteA}
                exigePacoteB={disciplina.exigePacoteB}
                usaEstruturaPastas={disciplina.usaPastas}
              />
              {!disciplina.jaValidado && (
                <DisciplinaDeleteButton disciplinaId={disciplina.id} nome={disciplina.nome} qtdTarefas={qtdTarefas} />
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {disciplina.responsaveis.length > 0 ? (
          disciplina.responsaveis.map((r) => (
            <span key={r.userId} className="rounded-sm bg-muted px-2 py-0.5">
              {r.name}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">Sem responsável</span>
        )}
        {disciplina.valor != null && (
          <span className="ml-auto font-mono text-muted-foreground">{brl(disciplina.valor)}</span>
        )}
      </div>

      <TrilhoEtapas disciplina={disciplina} />

      {podeMexerStatus && disciplina.status !== "aprovado" && (
        <Select value={disciplina.status} items={STATUS_LABEL} onValueChange={mudarStatus} disabled={pending}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* Só transições válidas da máquina de estados. "aprovado" fica de fora — só via validação. */}
            {STATUS_DISCIPLINA.filter(
              (s) =>
                s === disciplina.status ||
                (s !== "aprovado" && transicaoDisciplinaPermitida(disciplina.status, s)),
            ).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {disciplina.status === "aprovado" && podeGerir && (
        <ReabrirDisciplinaDialog disciplina={disciplina} />
      )}

      {disciplina.jaValidado && (
        <div className="flex items-center gap-1.5 rounded-sm bg-status-aprovado/10 px-2 py-1 text-xs text-status-aprovado">
          <ShieldCheck className="size-3.5" /> Entrega validada · pagamento liberado
        </div>
      )}

      {/* Pagamento já liberado numa disciplina ainda não aprovada (reabertura, ou base
          importada): aprovar NÃO gera outro pagamento. Sem este aviso a dúvida "vou pagar
          de novo?" trava a aprovação. */}
      {!disciplina.jaValidado && disciplina.temPagamento && (
        <div className="flex items-center gap-1.5 rounded-sm bg-status-revisao/10 px-2 py-1 text-xs text-status-revisao">
          <Unlock className="size-3.5" aria-hidden /> Pagamento já liberado · aprovar não gera novo
        </div>
      )}

      {disciplina.usaPastas ? (
        <FluxoAprovacaoDisciplina disciplina={disciplina} meRole={meRole} />
      ) : (
        !disciplina.jaValidado &&
        disciplina.status !== "aprovado" && (
          <PainelEntrega disciplina={disciplina} stVal={stVal} podeValidar={podeValidar} />
        )
      )}

      <div className="flex flex-wrap gap-1.5">
        <ArquivosDialog
          projetoId={projetoId}
          disciplina={disciplina}
          stVal={stVal}
          podeEnviar={podeEnviar}
          podeValidar={podeValidar}
        />
        <RevisaoDialog disciplina={disciplina} podeRegistrar={podeMexerStatus} />
        {podeGerir && <ResponsaveisDialog disciplina={disciplina} internos={internos} />}
        {podeDiario && <DiarioAtalhoButton projetoId={projetoId} disciplina={disciplina} />}
        {tarefaOpcoes && tarefaColunas && meId && meRole && (
          <TarefasDisciplinaDialog
            projetoId={projetoId}
            disciplinaId={disciplina.id}
            disciplinaNome={disciplina.nome}
            tarefas={tarefas ?? []}
            opcoes={tarefaOpcoes}
            colunas={tarefaColunas}
            meId={meId}
            meRole={meRole}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Trilho de etapas da disciplina — deixa visível que "Aprovado" é a CHEGADA do fluxo, não
 * uma opção do seletor. São 4 pontos porque `entregue` e `em_revisao` são o mesmo ponto do
 * caminho (a máquina alterna entre eles); o rótulo dessa etapa mostra o estado real.
 */
function TrilhoEtapas({ disciplina }: { disciplina: Disc }) {
  const atual = etapaDisciplina(disciplina.status);
  return (
    <ol className="flex items-center gap-1" aria-label="Etapas da disciplina">
      {ETAPAS_DISCIPLINA.map((_, i) => {
        const rotulo = rotuloEtapaDisciplina(i, disciplina.status, disciplina.aprovacaoSolicitadaEm);
        const percorrida = i <= atual;
        return (
          <Fragment key={i}>
            {i > 0 && (
              <span
                aria-hidden
                className={`h-px flex-1 ${i <= atual ? "bg-status-aprovado" : "bg-muted"}`}
              />
            )}
            <li
              className={`flex items-center gap-1 text-[10px] leading-tight ${
                i === atual ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
              aria-current={i === atual ? "step" : undefined}
            >
              <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full ${
                  percorrida ? "bg-status-aprovado" : "bg-muted-foreground/30"
                }`}
              />
              {rotulo}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/**
 * Painel de conclusão da entrega (fluxo pacote A/B) — resposta ao "cadê o status Aprovado?".
 *
 * `aprovado` é terminal e nunca aparece no seletor de status: só entra por `validarEntrega`.
 * Antes, o único botão vivia no rodapé do dialog de Arquivos, então o card não dava nenhum
 * sinal do que faltava. Aqui o card mostra SEMPRE um dos dois: o botão que conclui a entrega,
 * ou o motivo exato de ele ainda não estar disponível.
 *
 * As condições seguem as pré-condições do servidor (`validarEntrega`) para que o botão não
 * seja oferecido a uma chamada que a action vai recusar. Não é paridade exata: a contagem de
 * pacotes aqui usa `entregaveisAtuais` (só origem `manual`), enquanto o servidor aceita
 * qualquer upload no pacote — na prática só torna a exigência do painel mais estrita.
 */
function PainelEntrega({
  disciplina,
  stVal,
  podeValidar,
}: {
  disciplina: Disc;
  stVal: StatusValidacao;
  podeValidar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const semResponsavel = disciplina.responsaveis.length === 0;
  // Mesmos entregáveis que `statusValidacao` conta — a mensagem nunca contradiz `stVal`.
  const atuais = entregaveisAtuais(disciplina.uploads);
  const faltamPacotes = [
    disciplina.exigePacoteA && !atuais.some((u) => u.pacote === "A") ? "Pranchas e arquivos" : null,
    disciplina.exigePacoteB && !atuais.some((u) => u.pacote === "B") ? "Backup do modelo" : null,
  ].filter((s): s is string => s !== null);
  // Mesma regra que pinta o badge na lista/dashboard/Aprovações — se divergisse, a lista
  // diria "pronta para aprovar" e o card abriria sem botão.
  const pronta =
    prontidaoAprovacao({
      status: disciplina.status,
      usaPastas: disciplina.usaPastas,
      aprovacaoSolicitadaEm: disciplina.aprovacaoSolicitadaEm,
      exigePacoteA: disciplina.exigePacoteA,
      exigePacoteB: disciplina.exigePacoteB,
      qtdResponsaveis: disciplina.responsaveis.length,
      uploads: disciplina.uploads,
    }) === "pronta_validacao";

  function validar() {
    start(async () => {
      const res = await validarEntrega({ disciplinaId: disciplina.id });
      if (res.ok) {
        toast.success(
          res.data.pagamentos > 0
            ? `Entrega aprovada. ${res.data.pagamentos} pagamento(s) liberado(s).`
            : "Entrega aprovada. Sem pagamento (equipe CLT/estágio).",
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (pronta) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-status-aprovado/40 bg-status-aprovado/10 px-2.5 py-1.5 text-xs">
        <span className="text-status-aprovado">
          {stVal.total} arquivo(s) validado(s) — pronta para aprovação.
        </span>
        {podeValidar ? (
          <Button size="sm" className="ml-auto h-7 px-2" onClick={validar} disabled={pending}>
            <ShieldCheck className="size-3.5" /> {pending ? "Aprovando…" : "Aprovar entrega"}
          </Button>
        ) : (
          <span className="ml-auto text-muted-foreground">Aguardando validação do gestor.</span>
        )}
      </div>
    );
  }

  // Não está pronta: dizer exatamente o que falta, na ordem em que o servidor cobraria.
  const motivo =
    stVal.total === 0
      ? "Envie os arquivos da entrega para poder aprovar."
      : faltamPacotes.length > 0
        ? `Para aprovar, falta enviar: ${faltamPacotes.join(" e ")}.`
        : stVal.pendentes > 0
          ? `${stVal.validados} de ${stVal.total} arquivo(s) validado(s) — valide os ${stVal.pendentes} restante(s) em "Arquivos" para aprovar.`
          : semResponsavel
            ? "Defina ao menos um responsável para poder aprovar."
            : null;
  if (!motivo) return null;

  return (
    <p className="flex items-start gap-1.5 rounded-sm border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{motivo}</span>
    </p>
  );
}

/** Atalho do diário no card (visão geral): abre o modal compartilhado já fixado nesta disciplina. */
function DiarioAtalhoButton({ projetoId, disciplina }: { projetoId: string; disciplina: Disc }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <NotebookPen className="size-3.5" /> Diário
      </Button>
      <DiarioEntradaDialog
        open={open}
        onOpenChange={setOpen}
        disciplinas={[{ id: disciplina.id, nome: disciplina.nome }]}
        projetoId={projetoId}
        linkParaPainel
      />
    </>
  );
}

/**
 * Fluxo de aprovação em 2 etapas (aprovação/laudo): responsável marca "projeto aprovado";
 * admin/supervisor confirma (terminal) ou recusa (volta pra em_andamento, com motivo).
 */
function FluxoAprovacaoDisciplina({
  disciplina,
  meRole,
}: {
  disciplina: Disc;
  meRole?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const podeSolicitar = podeSolicitarAprovacao({
    ehResponsavel: disciplina.ehResponsavel,
    status: disciplina.status,
    aprovacaoSolicitadaEm: disciplina.aprovacaoSolicitadaEm,
  });
  const podeConfirmar = !!meRole && podeConfirmarOuRecusarAprovacao(meRole);
  const aguardando = disciplina.aprovacaoSolicitadaEm != null;

  function solicitar() {
    start(async () => {
      const res = await solicitarAprovacaoDisciplina({ disciplinaId: disciplina.id });
      if (res.ok) {
        toast.success("Projeto marcado como aprovado — aguardando confirmação.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function confirmar(valor?: number) {
    start(async () => {
      const res = await confirmarAprovacaoDisciplina({ disciplinaId: disciplina.id, valor });
      if (res.ok) {
        toast.success("Aprovação confirmada.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function recusar() {
    if (!motivo.trim()) return;
    start(async () => {
      const res = await recusarAprovacaoDisciplina({ disciplinaId: disciplina.id, motivo });
      if (res.ok) {
        toast.success("Aprovação recusada.");
        setRecusando(false);
        setMotivo("");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  // Sem ação disponível: em vez de sumir (o que deixava o card sem nenhuma pista de como
  // chegar em "aprovado"), explicar de quem é a vez. `aprovado` não entra aqui — o card já
  // mostra "Reabrir" nesse caso.
  if (!podeSolicitar && !aguardando) {
    if (disciplina.status === "aprovado") return null;
    const motivo =
      disciplina.responsaveis.length === 0
        ? "Defina ao menos um responsável — só ele pode marcar o projeto como aprovado."
        : disciplina.status === "aguardando"
          ? "Coloque a disciplina em andamento para poder marcá-la como aprovada."
          : "Aguardando o responsável marcar o projeto como aprovado.";
    return (
      <p className="flex items-start gap-1.5 rounded-sm border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{motivo}</span>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-status-entregue/40 bg-status-entregue/10 px-2.5 py-1.5 text-xs">
      {aguardando ? (
        <>
          <span className="text-status-entregue">
            Aguardando confirmação
            {disciplina.aprovacaoSolicitadaPorNome ? ` · solicitado por ${disciplina.aprovacaoSolicitadaPorNome}` : ""}
          </span>
          {podeConfirmar && (
            <div className="ml-auto flex gap-1.5">
              {disciplina.temPagamento ? (
                // Reaprovação: pagamento já liberado, sem valor a rever.
                <Button size="sm" className="h-7 px-2" onClick={() => confirmar()} disabled={pending}>
                  <CheckCircle className="size-3.5" /> Confirmar
                </Button>
              ) : (
                <ConfirmarAprovacaoDialog disciplina={disciplina} pending={pending} onConfirmar={confirmar} />
              )}
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setRecusando(true)} disabled={pending}>
                <XCircle className="size-3.5" /> Recusar
              </Button>
            </div>
          )}
        </>
      ) : (
        <Button size="sm" className="h-7 px-2" onClick={solicitar} disabled={pending}>
          <CheckCircle className="size-3.5" /> Marcar projeto aprovado
        </Button>
      )}

      <Dialog open={recusando} onOpenChange={setRecusando}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Recusar aprovação</DialogTitle>
            <DialogDescription>Explique o motivo — o responsável será notificado.</DialogDescription>
          </DialogHeader>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da recusa" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusando(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={recusar} disabled={pending || !motivo.trim()}>
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Diálogo do passo 2 (confirmar): mostra o valor a enviar ao financeiro e o split por
 * projetista ANTES de liberar o pagamento — resposta direta às disciplinas concluídas
 * sem valor (viravam PagamentoProjetista de R$ 0,00 na folha, sem lançamento). Só
 * aparece quando ainda não há pagamento liberado (`!disciplina.temPagamento`);
 * reaprovação usa o botão simples, sem valor a rever.
 */
function ConfirmarAprovacaoDialog({
  disciplina,
  pending,
  onConfirmar,
}: {
  disciplina: Disc;
  pending: boolean;
  onConfirmar: (valor: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [valorTexto, setValorTexto] = useState(() => String(disciplina.valor ?? ""));

  const responsaveisComRole = disciplina.responsaveis.map((r) => ({
    ...r,
    user: { role: r.role },
  }));
  const valorNum = valorTexto.trim() === "" ? null : Number(valorTexto);
  const valorValido = valorNum != null && !Number.isNaN(valorNum) && valorNum >= 0;
  const bloqueio = bloqueioValorDisciplina(responsaveisComRole, valorValido ? valorNum : null);
  const { pagaveis, salariados } = ratearPagamentoProjetista(
    responsaveisComRole,
    valorValido ? valorNum : 0,
  );

  function confirmar() {
    if (bloqueio || !valorValido) return;
    onConfirmar(valorNum);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setValorTexto(String(disciplina.valor ?? "")); }}>
      <DialogTrigger
        render={
          <Button size="sm" className="h-7 px-2">
            <CheckCircle className="size-3.5" /> Confirmar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar aprovação — {disciplina.nome}</DialogTitle>
          <DialogDescription>
            Revise o valor antes de enviar ao financeiro. Depois de confirmado, o pagamento é liberado
            e a alteração passa a exigir edição no financeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="valor-confirmacao">Valor total a pagar</Label>
          <Input
            id="valor-confirmacao"
            type="number"
            min={0}
            step="0.01"
            value={valorTexto}
            onChange={(e) => setValorTexto(e.target.value)}
            autoFocus
          />
        </div>

        {valorValido && (pagaveis.length > 0 || salariados.length > 0) && (
          <div className="space-y-1 rounded-sm border p-2 text-xs">
            {pagaveis.map(({ responsavel, valor }) => (
              <div key={responsavel.userId} className="flex justify-between">
                <span>{responsavel.name}</span>
                <span className="font-mono">{brl(valor)}</span>
              </div>
            ))}
            {salariados.map((r) => (
              <div key={r.userId} className="flex justify-between text-muted-foreground">
                <span>{r.name}</span>
                <span>sem pagamento (CLT/estágio)</span>
              </div>
            ))}
          </div>
        )}

        {bloqueio && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {bloqueio}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !valorValido || !!bloqueio}>
            Confirmar e enviar ao financeiro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArquivosDialog({
  projetoId,
  disciplina,
  stVal,
  podeEnviar,
  podeValidar,
}: {
  projetoId: string;
  disciplina: Disc;
  stVal: StatusValidacao;
  podeEnviar: boolean;
  podeValidar: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<LinhaEnvio[] | null>(null);
  const [pacote, setPacote] = useState<"A" | "B">("A");
  const [pastaId, setPastaId] = useState("");
  const [validando, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [versoesAbertas, setVersoesAbertas] = useState<Set<string>>(new Set());
  const alternarVersoes = (id: string) =>
    setVersoesAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // `stVal.completo` também é true sem nenhum entregável, e o servidor exige responsável —
  // sem os dois checks o botão fica habilitado para uma chamada que a action recusa.
  const completoParaValidar =
    stVal.completo &&
    stVal.total > 0 &&
    disciplina.responsaveis.length > 0 &&
    !disciplina.jaValidado;
  // Ids dos entregáveis na versão atual — só eles ganham controles de validação.
  const idsValidaveis = new Set(entregaveisAtuais(disciplina.uploads).map((u) => u.id));

  // Primeiro upload validado — âncora do aceite digital
  const uploadValidado = disciplina.uploads.find((u) => u.validado);
  const aceiteToken = uploadValidado?.aceiteToken ?? null;
  const aceiteSituacao = uploadValidado?.aceiteSituacao ?? null;

  function gerarLinkAceite() {
    if (!uploadValidado) return;
    start(async () => {
      const res = await gerarAceiteCliente({ uploadId: uploadValidado.id });
      if (res.ok) {
        const url = `${window.location.origin}/p/aceite/${res.data.token}`;
        await navigator.clipboard.writeText(url);
        toast.success("Link de aceite copiado para a área de transferência.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  async function enviar(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (disciplina.usaPastas && !pastaId) {
      toast.error("Selecione a pasta de destino.");
      return;
    }
    // Valida o tamanho ANTES de enviar — evita estourar o corpo da requisição no servidor.
    // O limite depende do pacote (B/backup = 1,5 GB; demais = 500 MB), igual ao servidor.
    const limite = limiteDoPacote(pacote);
    const aceitos: File[] = [];
    for (const f of Array.from(files)) {
      if (f.size > limite) toast.error(`${f.name}: excede o limite de ${limiteLabelDoPacote(pacote)}.`);
      else aceitos.push(f);
    }
    if (aceitos.length === 0) return;
    // Envia arquivo a arquivo (XHR) para mostrar a barra e o status de cada um —
    // uploads longos ou de vários arquivos não parecem mais "travados". Mesma
    // indicação visual da aba Arquivos (módulo compartilhado upload-progresso).
    setEnviando(true);
    const linhas: LinhaEnvio[] = aceitos.map((f) => ({
      nome: f.name,
      tamanho: f.size,
      status: "pendente",
      progresso: 0,
    }));
    setProgresso(linhas);
    let ok = 0;
    let real = 0;
    try {
      for (let i = 0; i < aceitos.length; i++) {
        const f = aceitos[i];
        setProgresso((prev) => (prev ? patchLinhaEnvio(prev, i, { status: "enviando" }) : prev));
        try {
          const r = await enviarArquivoComProgresso(
            f,
            disciplina.usaPastas
              ? { nome: f.name, disciplinaId: disciplina.id, pastaId }
              : { nome: f.name, disciplinaId: disciplina.id, pacote },
            (pct) => setProgresso((prev) => (prev ? patchLinhaEnvio(prev, i, { progresso: pct }) : prev)),
          );
          if (r.ok) ok++;
          if (r.realocado) real++;
          setProgresso((prev) =>
            prev ? patchLinhaEnvio(prev, i, { status: r.ok ? "ok" : "erro", progresso: 100, realocado: r.realocado, motivo: r.motivo }) : prev,
          );
        } catch (e) {
          setProgresso((prev) => (prev ? patchLinhaEnvio(prev, i, { status: "erro", motivo: (e as Error).message }) : prev));
        }
      }
      if (ok > 0) toast.success(`${ok} arquivo(s) enviado(s).`);
      if (real > 0) toast.info(`${real} arquivo(s) não suportado(s) foram para a pasta "outros".`);
      router.refresh();
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function validar() {
    start(async () => {
      const res = await validarEntrega({ disciplinaId: disciplina.id });
      if (res.ok) {
        toast.success(
          res.data.pagamentos > 0
            ? `Entrega aprovada. ${res.data.pagamentos} pagamento(s) liberado(s).`
            : "Entrega aprovada. Sem pagamento (equipe CLT/estágio).",
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const porPacote = (p: "A" | "B" | "OUTROS" | "RECEBIDOS") =>
    disciplina.uploads.filter((u) => u.pacote === p);

  // Conta arquivos lógicos (sem versões) e agrupa versões do mesmo arquivo
  // (mesma `(pacote, nome)`) — a mais recente é a "atual", as demais vão no acordeão.
  const contarLogicos = (itens: UploadItem[]) => new Set(itens.map((u) => `${u.pacote}/${u.nomeArquivo}`)).size;
  const agruparVersoes = (itens: UploadItem[]) => {
    const grupos = new Map<string, UploadItem[]>();
    const ordem: string[] = [];
    for (const u of itens) {
      if (!grupos.has(u.nomeArquivo)) {
        grupos.set(u.nomeArquivo, []);
        ordem.push(u.nomeArquivo);
      }
      grupos.get(u.nomeArquivo)!.push(u);
    }
    return ordem.map((nome) => {
      const vs = grupos.get(nome)!.slice().sort((a, b) => b.versao - a.versao);
      return { atual: vs[0], anteriores: vs.slice(1) };
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <FolderUp className="size-3.5" />{" "}
            Arquivos ({disciplina.usaPastas ? disciplina.arquivosPasta.length : contarLogicos(disciplina.uploads)})
          </Button>
        }
      />
      <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{disciplina.nome} — arquivos</DialogTitle>
          <DialogDescription>
            {disciplina.usaPastas ? "Árvore de pastas própria deste tipo de projeto." : "Pranchas e arquivos (A) · Backup do modelo (B)"}
          </DialogDescription>
        </DialogHeader>

        {disciplina.usaPastas ? (
          <>
            {podeEnviar && (
              <div className="space-y-2 rounded-sm border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SeletorPasta pastas={disciplina.pastas} value={pastaId} onChange={setPastaId} />
                  <Button size="sm" onClick={() => inputRef.current?.click()} disabled={enviando || !pastaId}>
                    <UploadIcon className="size-3.5" /> {enviando ? "Enviando…" : "Enviar arquivos"}
                  </Button>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => enviar(e.target.files)}
                  />
                </div>
                {progresso && progresso.length > 0 && (
                  <PainelProgressoEnvio
                    linhas={progresso}
                    enviando={enviando}
                    onFechar={() => setProgresso(null)}
                  />
                )}
              </div>
            )}
            <div className="min-w-0">
              <PastaTreeView
                disciplinaId={disciplina.id}
                projetoId={projetoId}
                pastas={disciplina.pastas}
                arquivos={disciplina.arquivosPasta}
                podeAdmin={podeValidar}
              />
            </div>
          </>
        ) : (
        <>
        {podeEnviar && !disciplina.jaValidado && (
          <div className="space-y-2 rounded-sm border p-3">
            <div className="flex items-center gap-2">
              <Select value={pacote} onValueChange={(v) => setPacote((v as typeof pacote) ?? "A")}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Pranchas e arquivos</SelectItem>
                  <SelectItem value="B">Backup do modelo</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={enviando}
              >
                <UploadIcon className="size-3.5" /> {enviando ? "Enviando…" : "Enviar arquivos"}
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => enviar(e.target.files)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Formatos não suportados em Pranchas e arquivos vão automaticamente para &quot;outros&quot;.
            </p>
            {progresso && progresso.length > 0 && (
              <PainelProgressoEnvio
                linhas={progresso}
                enviando={enviando}
                onFechar={() => setProgresso(null)}
              />
            )}
          </div>
        )}

        {podeValidar && stVal.total > 0 && !disciplina.jaValidado && (
          <p className="text-xs text-muted-foreground">
            {stVal.validados} de {stVal.total} arquivo(s) validado(s)
            {stVal.pendentes > 0 ? ` · ${stVal.pendentes} pendente(s)` : " · pronto para finalizar"}.
          </p>
        )}

        <div className="min-w-0 space-y-3">
          {(["A", "B", "OUTROS"] as const).map((p) => {
            const itens = porPacote(p);
            if (itens.length === 0 && p === "OUTROS") return null;
            return (
              <div key={p}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {p === "A"
                      ? "Pranchas e arquivos"
                      : p === "B"
                        ? "Backup do modelo"
                        : "Outros (não suportados)"}
                  </span>
                  {itens.length > 0 && (
                    <a
                      href={`/api/uploads/disciplina/${disciplina.id}/zip`}
                      className="hidden"
                      aria-hidden
                    />
                  )}
                </div>
                {itens.length === 0 ? (
                  <EmptyState icon={FileText} title="Nenhum arquivo" />
                ) : (
                  <ul className="min-w-0 space-y-1">
                    {agruparVersoes(itens).map(({ atual: u, anteriores }) => {
                      const aberto = versoesAbertas.has(u.id);
                      return (
                        <Fragment key={u.id}>
                          <li className="flex min-w-0 items-center gap-2 rounded-sm border px-2 py-1 text-xs">
                            <IconeArquivo nome={u.nomeArquivo} />
                            {u.nomeArquivo.toLowerCase().endsWith(".pdf") ? (
                              <a
                                href={`/projetos/${projetoId}/arquivos/${u.id}/visualizar`}
                                target="_blank"
                                rel="noopener"
                                className="min-w-0 flex-1 truncate hover:text-primary hover:underline"
                                title={`Visualizar ${u.nomeArquivo}`}
                              >
                                {u.nomeArquivo}
                                {u.versao > 1 && (
                                  <span className="ml-1 font-mono text-muted-foreground">{rotuloRevisao(u.versao)}</span>
                                )}
                              </a>
                            ) : (
                              <span className="min-w-0 flex-1 truncate" title={u.nomeArquivo}>
                                {u.nomeArquivo}
                                {u.versao > 1 && (
                                  <span className="ml-1 font-mono text-muted-foreground">{rotuloRevisao(u.versao)}</span>
                                )}
                              </span>
                            )}
                            <StatusArquivo aprovado={u.validado} ajusteObs={u.ajusteObs} dataAprovacao={u.data} />
                            {podeValidar && !disciplina.jaValidado && idsValidaveis.has(u.id) && (
                              <AcoesValidacaoArquivo
                                uploadId={u.id}
                                nomeArquivo={u.nomeArquivo}
                                validado={u.validado}
                              />
                            )}
                            {anteriores.length > 0 && (
                              <VersaoToggle
                                n={anteriores.length}
                                aberto={aberto}
                                onClick={() => alternarVersoes(u.id)}
                                nome={u.nomeArquivo}
                              />
                            )}
                            <span className="shrink-0 font-mono text-muted-foreground">{tamanhoLegivel(u.tamanho)}</span>
                            {u.nomeArquivo.toLowerCase().endsWith(".pdf") && (
                              <a
                                href={`/projetos/${projetoId}/arquivos/${u.id}/visualizar`}
                                target="_blank"
                                rel="noopener"
                                className="shrink-0 text-primary hover:underline"
                                aria-label="Visualizar prancha"
                                title="Visualizar prancha"
                              >
                                <Eye className="size-3.5" />
                              </a>
                            )}
                            <a
                              href={`/api/uploads/${u.id}/download`}
                              className="shrink-0 text-primary hover:underline"
                              aria-label="Baixar"
                            >
                              <Download className="size-3.5" />
                            </a>
                          </li>
                          {aberto &&
                            anteriores.map((v) => {
                              const ehPdf = v.nomeArquivo.toLowerCase().endsWith(".pdf");
                              return (
                                <li
                                  key={v.id}
                                  className="ml-5 flex min-w-0 items-center gap-2 rounded-sm border border-dashed px-2 py-1 text-xs text-muted-foreground"
                                >
                                  <IconeArquivo nome={v.nomeArquivo} />
                                  {ehPdf ? (
                                    <a
                                      href={`/projetos/${projetoId}/arquivos/${v.id}/visualizar`}
                                      target="_blank"
                                      rel="noopener"
                                      className="min-w-0 flex-1 truncate hover:text-primary hover:underline"
                                      title={`Visualizar ${v.nomeArquivo}`}
                                    >
                                      {v.nomeArquivo}
                                      <span className="ml-1 font-mono">{rotuloRevisao(v.versao)}</span>
                                    </a>
                                  ) : (
                                    <span className="min-w-0 flex-1 truncate" title={v.nomeArquivo}>
                                      {v.nomeArquivo}
                                      <span className="ml-1 font-mono">{rotuloRevisao(v.versao)}</span>
                                    </span>
                                  )}
                                  <StatusArquivo aprovado={v.validado} ajusteObs={v.ajusteObs} dataAprovacao={v.data} />
                                  <span className="shrink-0 font-mono">{tamanhoLegivel(v.tamanho)}</span>
                                  {ehPdf && (
                                    <a
                                      href={`/projetos/${projetoId}/arquivos/${v.id}/visualizar`}
                                      target="_blank"
                                      rel="noopener"
                                      className="shrink-0 text-primary hover:underline"
                                      aria-label={`Visualizar ${v.nomeArquivo} ${rotuloRevisao(v.versao)}`}
                                      title="Visualizar prancha"
                                    >
                                      <Eye className="size-3.5" />
                                    </a>
                                  )}
                                  <a
                                    href={`/api/uploads/${v.id}/download`}
                                    className="shrink-0 text-primary hover:underline"
                                    aria-label={`Baixar ${v.nomeArquivo} ${rotuloRevisao(v.versao)}`}
                                  >
                                    <Download className="size-3.5" />
                                  </a>
                                </li>
                              );
                            })}
                        </Fragment>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        </>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(disciplina.uploads.length > 0 || disciplina.arquivosPasta.length > 0) && (
              <Button variant="outline" size="sm" render={<a href={`/api/uploads/disciplina/${disciplina.id}/zip`} />}>
                <FileArchive className="size-3.5" /> Baixar tudo (.zip)
              </Button>
            )}
            {podeValidar && disciplina.jaValidado && !disciplina.usaPastas && (
              aceiteToken ? (
                <div className="flex items-center gap-2">
                  {aceiteSituacao === "aceito" && (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle className="size-3.5" /> Aceito pelo cliente
                    </span>
                  )}
                  {aceiteSituacao === "revisao" && (
                    <span className="flex items-center gap-1 text-xs text-warning">
                      <XCircle className="size-3.5" /> Revisão solicitada
                    </span>
                  )}
                  {aceiteSituacao === "pendente" && (
                    <span className="text-xs text-muted-foreground">Aguardando aceite</span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={gerarLinkAceite}
                    disabled={validando}
                    title="Copiar link de aceite"
                  >
                    <Link2 className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={gerarLinkAceite} disabled={validando}>
                  <Link2 className="size-3.5" /> Link de aceite
                </Button>
              )
            )}
          </div>
          {podeValidar && !disciplina.usaPastas && (
            <Button onClick={validar} disabled={!completoParaValidar || validando}>
              <ShieldCheck className="size-4" />
              {disciplina.jaValidado
                ? "Já validada"
                : validando
                  ? "Validando…"
                  : "Validar entrega"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reabrir disciplina aprovada (gestor). Volta para "em revisão" com motivo — fica na auditoria. */
function ReabrirDisciplinaDialog({ disciplina }: { disciplina: Disc }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();

  function reabrir() {
    if (motivo.trim().length < 3) {
      toast.error("Explique o motivo da reabertura.");
      return;
    }
    start(async () => {
      const res = await reabrirDisciplina({ disciplinaId: disciplina.id, motivo: motivo.trim() });
      if (res.ok) {
        toast.success("Disciplina reaberta para revisão.");
        setMotivo("");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="w-full">
            <Unlock className="size-3.5" /> Reabrir disciplina
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reabrir {disciplina.nome}</DialogTitle>
          <DialogDescription>
            Volta para &ldquo;em revisão&rdquo; para novos ajustes. O pagamento já liberado é mantido — a
            reaprovação posterior não gera pagamento novo. A reabertura fica registrada na auditoria.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo da reabertura"
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={reabrir} loading={pending}>
            Reabrir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevisaoDialog({
  disciplina,
  podeRegistrar,
}: {
  disciplina: Disc;
  podeRegistrar: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();

  function registrar() {
    start(async () => {
      const res = await registrarRevisao({ disciplinaId: disciplina.id, motivo: motivo || undefined });
      if (res.ok) {
        toast.success(`Revisão RV${String(res.data.numero).padStart(2, "0")} registrada.`);
        setMotivo("");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <History className="size-3.5" /> Revisões ({disciplina.revisoes.length})
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{disciplina.nome} — revisões</DialogTitle>
          <DialogDescription>Histórico imutável de revisões (RVxx).</DialogDescription>
        </DialogHeader>

        <div className="max-h-60 space-y-2 overflow-y-auto">
          {disciplina.revisoes.length === 0 ? (
            <EmptyState icon={GitBranch} title="Nenhuma revisão registrada" />
          ) : (
            disciplina.revisoes.map((rv) => (
              <div key={rv.id} className="rounded-sm border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  <span className="font-mono font-semibold">
                    RV{String(rv.numero).padStart(2, "0")}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatarData(rv.data)} · {rv.autor}
                  </span>
                </div>
                {rv.motivo && <p className="mt-1 text-muted-foreground">{rv.motivo}</p>}
              </div>
            ))
          )}
        </div>

        {podeRegistrar && (
          <div className="space-y-2">
            <Label>Motivo da revisão (opcional)</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        )}

        <DialogFooter>
          {podeRegistrar && (
            <Button onClick={registrar} disabled={pending}>
              {pending ? "Registrando…" : "Registrar revisão"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResponsaveisDialog({
  disciplina,
  internos,
}: {
  disciplina: Disc;
  internos: { id: string; name: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(disciplina.responsaveis.map((r) => r.userId));
  const [pending, start] = useTransition();

  function toggle(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function salvar() {
    start(async () => {
      const res = await definirResponsaveis({ disciplinaId: disciplina.id, responsaveisIds: sel });
      if (res.ok) {
        toast.success("Responsáveis atualizados.");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Users className="size-3.5" /> Responsáveis
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{disciplina.nome} — responsáveis</DialogTitle>
          <DialogDescription>Permite múltiplos responsáveis.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {internos.map((u) => {
            const s = sel.includes(u.id);
            return (
              <button
                type="button"
                key={u.id}
                onClick={() => toggle(u.id)}
                className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                  s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {u.name}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lista as tarefas da disciplina e permite criar/editar (reaproveita o TarefaDialog do módulo). */
function TarefasDisciplinaDialog({
  projetoId,
  disciplinaId,
  disciplinaNome,
  tarefas,
  opcoes,
  colunas,
  meId,
  meRole,
}: {
  projetoId: string;
  disciplinaId: string;
  disciplinaNome: string;
  tarefas: TarefaDaDisciplina[];
  opcoes: OpcoesUI;
  colunas: { id: string; nome: string }[];
  meId: string;
  meRole: string;
}) {
  const [openLista, setOpenLista] = useState(false);
  const [editar, setEditar] = useState<TarefaDaDisciplina | "nova" | null>(null);

  return (
    <>
      <Dialog open={openLista} onOpenChange={setOpenLista}>
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <ListTodo className="size-3.5" /> Tarefas ({tarefas.length})
            </Button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{disciplinaNome} — tarefas</DialogTitle>
            <DialogDescription>Tarefas vinculadas a esta disciplina.</DialogDescription>
          </DialogHeader>

          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {tarefas.length === 0 ? (
              <EmptyState icon={ListTodo} title="Nenhuma tarefa" />
            ) : (
              tarefas.map((t) => {
                const feitos = t.itens.filter((i) => i.concluido).length;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setOpenLista(false);
                      setEditar(t);
                    }}
                    className="flex w-full flex-col gap-1 rounded-sm border p-2 text-left text-sm transition-colors hover:border-primary/50"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: t.statusCor ?? "#576980" }}
                      />
                      <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                      {ehPrioridade(t.prioridade) && (
                        <Badge
                          variant="outline"
                          className={`h-4 px-1 text-[9px] leading-none ${PRIORIDADE_CLASS[t.prioridade]}`}
                        >
                          {PRIORIDADE_LABEL[t.prioridade]}
                        </Badge>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{t.statusNome}</span>
                      {t.prazo && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="size-3" /> {formatarData(t.prazo)}
                        </span>
                      )}
                      {t.itens.length > 0 && (
                        <span>
                          ☑ {feitos}/{t.itens.length}
                        </span>
                      )}
                      {t.responsaveis.length > 0 && (
                        <span className="truncate">{t.responsaveis.map((r) => r.nome).join(", ")}</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setOpenLista(false);
                setEditar("nova");
              }}
            >
              <Plus className="size-4" /> Nova tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TarefaDialog
        tarefa={editar === "nova" ? null : editar}
        open={editar !== null}
        onOpenChange={(o) => !o && setEditar(null)}
        opcoes={opcoes}
        colunas={colunas}
        meId={meId}
        meRole={meRole}
        valoresIniciais={editar === "nova" ? { projetoId, disciplinaId } : undefined}
      />
    </>
  );
}
