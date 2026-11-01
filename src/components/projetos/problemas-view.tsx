"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardList } from "lucide-react";
import { toast } from "sonner";

import { ProblemaConversa } from "@/components/projetos/problema-conversa";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { cn, formatarData, formatarDataHora, rotuloRevisao } from "@/lib/utils";
import type { ActionResult } from "@/lib/with-action";
import {
  ACAO_RESOLVER_NA_REVISAO,
  ACAO_RESPONDER,
  destinoDoItem,
} from "@/modules/projetos/pendencias/acoes-apontamento";
import { deveOcultarMenu, itensDoProblema } from "@/modules/projetos/pendencias/acoes-problema";
import {
  adiarPendencia,
  assumirCorrecaoPendencia,
  descartarPendencia,
  fecharPendencia,
  marcarPendenciaResolvidaEmRevisao,
  reabrirPendencia,
  resolverPendencia,
} from "@/modules/projetos/pendencias/actions";
import {
  SEVERIDADES,
  SEVERIDADE_LABEL,
  STATUS_LABEL,
  TIPOS_PENDENCIA,
  TIPO_PENDENCIA_LABEL,
  type Severidade,
  type StatusPendencia,
  type TipoPendencia,
} from "@/modules/projetos/pendencias/helpers";
import {
  SITUACAO_LABEL,
  SITUACOES,
  agruparPorDisciplina,
  contarPorSituacao,
  dicaDeOutrasSituacoes,
  diasEmAberto,
  filtrarProblemas,
  hrefDaPrancha,
  podeParticiparDaConversa,
  type ProblemaLinha,
  type SituacaoProblema,
} from "@/modules/projetos/pendencias/problemas";

/** Mesma escala de cor do visualizador e da visão consolidada — só o impeditivo é sólido. */
const SEVERIDADE_CLS: Record<Severidade, string> = {
  impeditivo: "border-transparent bg-destructive text-white",
  alta: "text-destructive border-destructive/40",
  media: "text-warning border-warning/40",
  baixa: "text-muted-foreground border-muted",
};

type Transicao = {
  sucesso: string;
  /** `null` quando a transição não é direta — "não procede" passa pela janela de justificativa. */
  acao: ((i: { id: string }) => Promise<ActionResult<unknown>>) | null;
};

/** Mesmas frases de sucesso do visualizador (`ACAO_TRANSICAO` do pdf-viewer). */
const TRANSICAO: Record<StatusPendencia, Transicao> = {
  em_correcao: { sucesso: "Assumida para correção.", acao: assumirCorrecaoPendencia },
  resolvida: { sucesso: "Marcada como resolvida.", acao: resolverPendencia },
  aberta: { sucesso: "Voltou para a fila.", acao: reabrirPendencia },
  fechada: { sucesso: "Apontamento fechado.", acao: fecharPendencia },
  descartada: { sucesso: "Marcado como não procede.", acao: null },
  adiado: { sucesso: "Apontamento adiado.", acao: adiarPendencia },
};

/** Falha de rede/servidor (a action lançou em vez de devolver `{ ok: false }`). */
const ERRO_DE_CONEXAO = "Não foi possível concluir. Verifique a conexão e tente de novo.";

const FILTROS_PADRAO: { situacao: SituacaoProblema; severidade: string; tipo: string } = {
  situacao: "em_aberto",
  severidade: "todas",
  tipo: "todos",
};

/** Itens da linha; vazio quando a única ação ativa já é um botão da própria linha (regra 4 da ADR-0002). */
function menuDaLinha(l: ProblemaLinha, ctx: Parameters<typeof itensDoProblema>[1]): AcaoItem[] {
  const itens = itensDoProblema(l, ctx);
  return deveOcultarMenu(itens) ? [] : itens;
}

type PropsLinha = {
  linha: ProblemaLinha;
  projetoId: string;
  usuarioId: string;
  itens: AcaoItem[];
  expandido: boolean;
  /** Uma ação desta linha está em andamento. */
  ocupado: boolean;
  agora: Date;
  onAlternar: (id: string) => void;
  onSelect: (linha: ProblemaLinha, item: AcaoItemAcao) => void;
};

/** Linha de topo (não definida dentro do pai): senão remonta a cada render e fecha o menu aberto. */
function LinhaProblema({ linha, projetoId, usuarioId, itens, expandido, ocupado, agora, onAlternar, onSelect }: PropsLinha) {
  const href = hrefDaPrancha(linha, projetoId);
  const dias = diasEmAberto(linha.createdAt, linha.fechadoEm, agora);
  const statusLabel = STATUS_LABEL[linha.status as StatusPendencia] ?? linha.status;
  const idDetalhe = `detalhe-problema-${linha.id}`;

  // O menu da linha fica só no cabeçalho e nos dados: o texto inteiro, as respostas e o campo de
  // resposta (o detalhe) ficam FORA do gatilho e mantêm o menu nativo — colar, corretor, copiar (ADR-0002).
  return (
    <li className={cn("px-3 py-2 text-sm transition-opacity", ocupado && "opacity-60")} aria-busy={ocupado || undefined}>
      <LinhaComMenu itens={itens} onSelect={(item) => onSelect(linha, item)} render={<div />}>
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => onAlternar(linha.id)}
            aria-expanded={expandido}
            aria-controls={idDetalhe}
            title={linha.texto}
            className="flex min-w-0 flex-1 items-start gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              aria-hidden
              className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", expandido && "rotate-90")}
            />
            <span className="font-medium">#{linha.numero}</span>
            <span className="line-clamp-2 min-w-0 flex-1 break-words">{linha.texto}</span>
          </button>
          <BotaoAcoes itens={itens} onSelect={(item) => onSelect(linha, item)} rotulo={`Ações do problema #${linha.numero}`} />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-6 text-xs text-muted-foreground">
          {href ? (
            <Link href={href} className="min-w-0 break-all hover:text-foreground hover:underline" title="Abrir na prancha">
              {linha.arquivo} · pág. {linha.pagina}
            </Link>
          ) : (
            <span className="min-w-0 break-all" title="Arquivo indisponível">
              {linha.arquivo} · pág. {linha.pagina}
            </span>
          )}
          {linha.severidade && (
            <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", SEVERIDADE_CLS[linha.severidade as Severidade])}>
              {SEVERIDADE_LABEL[linha.severidade as Severidade] ?? linha.severidade}
            </Badge>
          )}
          {linha.tipo && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
              {TIPO_PENDENCIA_LABEL[linha.tipo as TipoPendencia] ?? linha.tipo}
            </Badge>
          )}
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{statusLabel}</Badge>
          {linha.prazo && <span>Prazo {formatarData(linha.prazo)}</span>}
          <span>{linha.fechadoEm ? `${dias}d até encerrar` : `${dias}d em aberto`}</span>
        </div>
      </LinhaComMenu>

      <div id={idDetalhe} hidden={!expandido}>
        {expandido && <DetalheDoProblema linha={linha} usuarioId={usuarioId} />}
      </div>
    </li>
  );
}

/** Área que abre sob a linha: o texto inteiro, a procedência e a conversa. */
function DetalheDoProblema({ linha, usuarioId }: { linha: ProblemaLinha; usuarioId: string }) {
  // A MESMA função que o servidor usa em `responderPendencia`: a tela não oferece o que a action nega.
  const podeResponder = podeParticiparDaConversa({
    autorId: linha.autorId,
    usuarioId,
    ehResponsavel: linha.papeis.ehResponsavel,
    ehGlobal: linha.papeis.ehGlobal,
  });
  return (
    <div className="mt-2 space-y-2 pl-6">
      <p className="whitespace-pre-wrap break-words text-sm">{linha.texto}</p>
      <p className="text-xs text-muted-foreground">
        Apontado por {linha.autor} em {formatarDataHora(linha.createdAt)}
        {linha.fechadoEm ? ` · encerrado em ${formatarDataHora(linha.fechadoEm)}` : ""}
        {linha.deOutraRevisao ? " · trazido de revisão anterior" : ""}
      </p>
      <ProblemaConversa linha={linha} podeResponder={podeResponder} />
    </div>
  );
}

export function ProblemasView({
  projetoId,
  linhas,
  usuarioId,
  ehAdmin,
  podeValidar,
}: {
  projetoId: string;
  linhas: ProblemaLinha[];
  usuarioId: string;
  ehAdmin: boolean;
  podeValidar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [agora] = useState(() => new Date());
  const [situacao, setSituacao] = useState<SituacaoProblema>(FILTROS_PADRAO.situacao);
  const [severidade, setSeveridade] = useState<string>(FILTROS_PADRAO.severidade);
  const [tipo, setTipo] = useState<string>(FILTROS_PADRAO.tipo);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(() => new Set());
  const [descartarId, setDescartarId] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState("");

  const contagem = useMemo(() => contarPorSituacao(linhas), [linhas]);
  const grupos = useMemo(
    () => agruparPorDisciplina(filtrarProblemas(linhas, { situacao, severidade, tipo })),
    [linhas, situacao, severidade, tipo],
  );
  const ctx = { usuarioId, ehAdmin, podeValidar, projetoId };
  const filtrosPadrao =
    situacao === FILTROS_PADRAO.situacao && severidade === FILTROS_PADRAO.severidade && tipo === FILTROS_PADRAO.tipo;
  const dicaVazio = useMemo(
    () => dicaDeOutrasSituacoes(contarPorSituacao(linhas, { severidade, tipo }), situacao),
    [linhas, severidade, tipo, situacao],
  );

  function limparFiltros() {
    setSituacao(FILTROS_PADRAO.situacao);
    setSeveridade(FILTROS_PADRAO.severidade);
    setTipo(FILTROS_PADRAO.tipo);
  }

  /**
   * Roda a action de UMA linha: marca a linha como ocupada (a tela mostra que algo está andando em
   * vez de ignorar o clique) e trata a falha de rede, que chega como exceção e não como `{ ok: false }`.
   * A linha só aparece ocupada enquanto a transição está pendente (inclui o `router.refresh()`), então
   * `ocupadoId` não precisa ser limpo: a próxima ação o sobrescreve.
   */
  function rodarNaLinha(id: string, acao: () => Promise<void>) {
    setOcupadoId(id);
    start(async () => {
      try {
        await acao();
      } catch {
        toast.error(ERRO_DE_CONEXAO);
      }
    });
  }

  function alternar(id: string) {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function expandir(id: string) {
    setExpandidos((atual) => (atual.has(id) ? atual : new Set(atual).add(id)));
  }

  function executar(linha: ProblemaLinha, item: AcaoItemAcao) {
    if (item.desabilitado || pending) return;
    if (item.id === ACAO_RESPONDER) {
      expandir(linha.id);
      return;
    }
    if (item.id === ACAO_RESOLVER_NA_REVISAO) {
      // Igual ao visualizador (`resolverEmRevisao`): registra a resolução na revisão vigente do documento.
      const revisaoResolucaoId = linha.revisaoVigenteId;
      if (revisaoResolucaoId == null) {
        toast.error("Não há revisão vigente para registrar a resolução. Abra a prancha para resolver.");
        return;
      }
      rodarNaLinha(linha.id, async () => {
        const r = await marcarPendenciaResolvidaEmRevisao({ id: linha.id, revisaoResolucaoId });
        if (r.ok) {
          toast.success(`Marcada como resolvida na ${rotuloRevisao(linha.revisaoVigenteNumero)}.`);
          router.refresh();
        } else toast.error(r.error);
      });
      return;
    }
    const destino = destinoDoItem(item.id);
    if (!destino) return;
    const meta = TRANSICAO[destino];
    // Sem action direta = precisa de janela ("não procede" pede justificativa).
    if (!meta.acao) {
      setJustificativa("");
      setDescartarId(linha.id);
      return;
    }
    const acao = meta.acao;
    rodarNaLinha(linha.id, async () => {
      const r = await acao({ id: linha.id });
      if (r.ok) {
        toast.success(meta.sucesso);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function confirmarDescarte() {
    if (!descartarId) return;
    const id = descartarId;
    const texto = justificativa.trim();
    if (texto.length < 3) return;
    rodarNaLinha(id, async () => {
      const r = await descartarPendencia({ id, justificativa: texto });
      if (r.ok) {
        setDescartarId(null);
        setJustificativa("");
        toast.success(TRANSICAO.descartada.sucesso);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  if (linhas.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Nenhum problema neste projeto."
        description="Os apontamentos enviados pela coordenação aparecem aqui."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={situacao} onValueChange={(v) => setSituacao((v as SituacaoProblema | null) ?? "em_aberto")}>
          <SelectTrigger className="w-60" aria-label="Situação"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SITUACOES.map((s) => (
              <SelectItem key={s} value={s}>{SITUACAO_LABEL[s]} ({contagem[s]})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severidade} onValueChange={(v) => setSeveridade(v ?? "todas")}>
          <SelectTrigger className="w-44" aria-label="Severidade"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda severidade</SelectItem>
            {SEVERIDADES.map((s) => (
              <SelectItem key={s} value={s}>{SEVERIDADE_LABEL[s]}</SelectItem>
            ))}
            <SelectItem value="sem">Não classificados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={(v) => setTipo(v ?? "todos")}>
          <SelectTrigger className="w-48" aria-label="Tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo tipo</SelectItem>
            {TIPOS_PENDENCIA.map((t) => (
              <SelectItem key={t} value={t}>{TIPO_PENDENCIA_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {grupos.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nenhum problema com esses filtros."
            description={["Ajuste a situação, a severidade ou o tipo.", dicaVazio].filter(Boolean).join(" ")}
            action={
              filtrosPadrao ? undefined : (
                <Button variant="outline" size="sm" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              )
            }
          />
        ) : (
          grupos.map((g) => (
            <CollapsibleSection
              key={g.disciplinaId}
              titulo={g.disciplinaNome}
              resumo={<Badge variant="outline" className="text-xs">{g.linhas.length}</Badge>}
              defaultOpen
            >
              <ul className="divide-y">
                {g.linhas.map((l) => (
                  <LinhaProblema
                    key={l.id}
                    linha={l}
                    projetoId={projetoId}
                    usuarioId={usuarioId}
                    itens={menuDaLinha(l, ctx)}
                    expandido={expandidos.has(l.id)}
                    ocupado={pending && ocupadoId === l.id}
                    agora={agora}
                    onAlternar={alternar}
                    onSelect={executar}
                  />
                ))}
              </ul>
            </CollapsibleSection>
          ))
        )}
      </div>

      {/* "Não procede": a justificativa é obrigatória e o servidor valida de novo */}
      <Dialog
        open={descartarId != null}
        onOpenChange={(o) => {
          if (!o) {
            setDescartarId(null);
            setJustificativa("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como não procede</DialogTitle>
            <DialogDescription>
              Encerra o apontamento sem correção. A justificativa fica registrada e aparece para o projetista.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="justificativa-descarte-problema">Por que não procede?</Label>
            <textarea
              id="justificativa-descarte-problema"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
              maxLength={1000}
              autoFocus
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDescartarId(null);
                setJustificativa("");
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={confirmarDescarte} disabled={pending || justificativa.trim().length < 3}>
              {pending ? "Salvando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
