"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronsLeftRight, ChevronsRightLeft } from "lucide-react";
import type { EstagioNegociacao, StatusProspeccao } from "@/generated/prisma/client";
import { moverEstagioNegociacao, moverProspeccao } from "@/modules/comercial/actions";
import type { CardFunil, ColunaFunilDados, MotivoPerdaOpcao } from "@/modules/comercial/queries";
import {
  COLUNA_FUNIL_LABEL,
  COOKIE_COLUNAS_FECHADAS,
  colunaDoCard,
  decidirSoltura,
  ehColunaFunil,
  type ColunaFunil,
  type OpcaoEncerramento,
} from "@/modules/comercial/funil";
import { STATUS_PROSPECCAO_LABEL } from "@/modules/comercial/prospeccao";
import { useSetParams } from "@/lib/use-set-param";
import { brlInteiro } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MotivoPerdaNegociacaoDialog } from "./motivo-perda-negociacao-dialog";
import { FunilComercialCard, chaveCard } from "./funil-comercial-card";

const refDo = (c: CardFunil) =>
  c.tipo === "LEAD" ? ({ tipo: "LEAD", status: c.status } as const) : ({ tipo: "NEGOCIACAO", estagio: c.estagio } as const);

const tituloDo = (c: CardFunil) => (c.tipo === "LEAD" ? (c.cliente?.nome ?? c.nome) : c.titulo);

function gravarFechadas(fechadas: Set<ColunaFunil>) {
  // Cookie, e não localStorage: o servidor precisa saber quais colunas NÃO buscar.
  document.cookie = `${COOKIE_COLUNAS_FECHADAS}=${[...fechadas].join(",")}; path=/comercial; max-age=31536000; samesite=lax`;
}

/**
 * Board único de Prospecção + Negociação (ADR-0004).
 *
 * Movimento otimista com rollback, como os dois boards que ele substitui: `movidos` sobrepõe a
 * coluna vinda do servidor só para os cards arrastados desde a última leitura; erro remove a
 * sobreposição e o card volta sozinho. O que decide cada soltura é `decidirSoltura` (puro, testado).
 */
export function FunilComercialBoard({
  colunas,
  motivos,
  pagina,
}: {
  colunas: ColunaFunilDados[];
  motivos: MotivoPerdaOpcao[];
  pagina: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setParams = useSetParams();
  const confirm = useConfirm();
  const [, start] = useTransition();
  const [arrastando, setArrastando] = useState<CardFunil | null>(null);
  const [movidos, setMovidos] = useState<Record<string, ColunaFunil>>({});
  const [fechadas, setFechadas] = useState(() => new Set(colunas.filter((c) => c.fechada).map((c) => c.coluna)));
  const [perda, setPerda] = useState<CardFunil | null>(null);
  const [encerrar, setEncerrar] = useState<{ card: CardFunil; opcoes: OpcaoEncerramento[] } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const agora = useMemo(() => new Date(), []);
  const alvoId = searchParams.get("negociacao");
  // Dados novos do servidor já refletem os movimentos confirmados: a sobreposição otimista cai.
  const [base, setBase] = useState(colunas);
  if (base !== colunas) {
    setBase(colunas);
    setMovidos({});
  }

  useEffect(() => {
    if (!alvoId) return;
    document.getElementById(`card-negociacao-${alvoId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }, [alvoId]);

  const todos = useMemo(() => colunas.flatMap((c) => c.cards), [colunas]);

  const exibidas = useMemo(
    () =>
      colunas.map((c) => {
        const cards = todos.filter((card) => (movidos[chaveCard(card)] ?? colunaDoCard(refDo(card))) === c.coluna);
        return { ...c, cards, total: c.total + cards.length - c.cards.length };
      }),
    [colunas, todos, movidos],
  );

  function alternar(coluna: ColunaFunil) {
    const abrindo = fechadas.has(coluna);
    const nova = new Set(fechadas);
    if (abrindo) nova.delete(coluna);
    else nova.add(coluna);
    setFechadas(nova);
    gravarFechadas(nova);
    // Recolhida não trouxe card do servidor; abrir precisa buscar. Fechar não precisa de nada.
    if (abrindo && colunas.find((c) => c.coluna === coluna)?.fechada) router.refresh();
  }

  function desfazer(chave: string) {
    setMovidos((m) => {
      const resto = { ...m };
      delete resto[chave];
      return resto;
    });
  }

  function executar(card: CardFunil, destino: ColunaFunil, acao: () => Promise<{ ok: boolean; error?: string }>, sucesso?: string) {
    const chave = chaveCard(card);
    setMovidos((m) => ({ ...m, [chave]: destino }));
    start(async () => {
      const r = await acao();
      if (r.ok) {
        if (sucesso) toast.success(sucesso);
        router.refresh();
      } else {
        desfazer(chave);
        toast.error(r.error ?? "Não foi possível mover o card.");
      }
    });
  }

  function moverLead(card: CardFunil, para: StatusProspeccao, destino: ColunaFunil) {
    executar(card, destino, () => moverProspeccao({ leadId: card.id, para }));
  }

  function moverNegociacao(
    card: CardFunil,
    para: EstagioNegociacao,
    destino: ColunaFunil,
    perdaDados?: { motivoPerdaId: string; concorrente: string; observacao: string },
  ) {
    executar(card, destino, () =>
      moverEstagioNegociacao({
        negociacaoId: card.id,
        para,
        motivoPerdaId: perdaDados?.motivoPerdaId ?? "",
        concorrente: perdaDados?.concorrente ?? "",
        observacao: perdaDados?.observacao ?? "",
      }),
    );
  }

  async function onDragEnd(e: DragEndEvent) {
    setArrastando(null);
    const destino = e.over ? String(e.over.id) : null;
    if (!destino || !ehColunaFunil(destino)) return;
    const card = todos.find((c) => chaveCard(c) === String(e.active.id));
    if (!card) return;

    // Movimento anterior ainda sem resposta: o status real do card é desconhecido até ela chegar.
    if (movidos[chaveCard(card)]) {
      toast.info("Aguarde o movimento anterior deste card terminar.");
      return;
    }
    const soltura = decidirSoltura(refDo(card), destino);

    switch (soltura.acao) {
      case "nada":
        return;
      case "recusar":
        toast.error(soltura.mensagem);
        return;
      case "mover-lead":
        moverLead(card, soltura.para, destino);
        return;
      case "mover-negociacao":
        moverNegociacao(card, soltura.para, destino);
        return;
      case "encerrar":
        setEncerrar({ card, opcoes: soltura.opcoes });
        return;
      case "qualificar": {
        // Confirma ANTES do start(): `await confirm()` dentro de startTransition trava no React 19.
        if (soltura.reativa) {
          const ok = await confirm({
            title: "Reativar prospecção?",
            description:
              `Esta prospecção está "${STATUS_PROSPECCAO_LABEL[soltura.statusAtual]}". Levar para a ` +
              "negociação vai reativá-la e abrir uma negociação.",
            confirmLabel: "Reativar e qualificar",
          });
          if (!ok) return;
        }
        executar(
          card,
          destino,
          () =>
            moverProspeccao({
              leadId: card.id,
              para: "OPORTUNIDADE_CRIADA",
              confirmarReativacao: soltura.reativa,
            }),
          "Prospecção qualificada — negociação criada.",
        );
        return;
      }
    }
  }

  function escolherEncerramento(opcao: OpcaoEncerramento) {
    const alvo = encerrar?.card;
    setEncerrar(null);
    if (!alvo) return;
    if (opcao.tipo === "LEAD") moverLead(alvo, opcao.para, "ENCERRADOS");
    else if (opcao.para === "PERDIDO") setPerda(alvo);
    else moverNegociacao(alvo, opcao.para, "ENCERRADOS");
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setArrastando(todos.find((c) => chaveCard(c) === e.active.id) ?? null)}
        onDragEnd={onDragEnd}
      >
        {/* Mesma regra dos boards anteriores (F2.17): empilha em tela pequena, lado a lado a
            partir de `sm` — por CSS, para não piscar layout errado antes da hidratação. */}
        <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:overflow-x-auto">
          {exibidas.map((c, i) => (
            <Coluna
              key={c.coluna}
              dados={c}
              fechada={fechadas.has(c.coluna)}
              aguardandoDados={!fechadas.has(c.coluna) && c.fechada}
              inicioNegociacao={i > 0 && exibidas[i - 1].coluna === "QUALIFICADO"}
              onAlternar={() => alternar(c.coluna)}
              agora={agora}
              alvoId={alvoId}
            />
          ))}
        </div>
        <DragOverlay>
          {arrastando ? <FunilComercialCard card={arrastando} agora={agora} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {colunas.some((c) => c.temMais && !c.fechada) && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setParams({ page: String(pagina + 1) })}>
            Carregar mais
          </Button>
        </div>
      )}

      <Dialog open={encerrar != null} onOpenChange={(o) => !o && setEncerrar(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Encerrar card</DialogTitle>
            <DialogDescription>
              {encerrar ? `Como encerrar "${tituloDo(encerrar.card)}"?` : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {encerrar?.opcoes.map((o) => (
              <Button key={o.para} variant="outline" onClick={() => escolherEncerramento(o)}>
                {o.label}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEncerrar(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {perda && (
        <MotivoPerdaNegociacaoDialog
          titulo={tituloDo(perda)}
          motivos={motivos}
          onCancelar={() => setPerda(null)}
          onConfirmar={(motivoPerdaId, concorrente, observacao) => {
            const alvo = perda;
            setPerda(null);
            moverNegociacao(alvo, "PERDIDO", "ENCERRADOS", { motivoPerdaId, concorrente, observacao });
          }}
        />
      )}
    </>
  );
}

function Coluna({
  dados,
  fechada,
  aguardandoDados,
  inicioNegociacao,
  onAlternar,
  agora,
  alvoId,
}: {
  dados: ColunaFunilDados;
  fechada: boolean;
  aguardandoDados: boolean;
  inicioNegociacao: boolean;
  onAlternar: () => void;
  agora: Date;
  alvoId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dados.coluna });
  const label = COLUNA_FUNIL_LABEL[dados.coluna];
  const borda = isOver ? "border-primary bg-primary/5" : "border-border/60";
  const divisa = inicioNegociacao ? "sm:ml-3 sm:border-l-primary/40" : "";

  if (fechada) {
    return (
      <div
        ref={setNodeRef}
        className={`flex shrink-0 items-center gap-2 rounded-sm border p-2 transition-colors sm:w-11 sm:flex-col ${borda} ${divisa}`}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Expandir coluna ${label}`}
          title={`Expandir ${label}`}
          onClick={onAlternar}
        >
          <ChevronsLeftRight className="size-4" />
        </Button>
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {dados.total}
        </Badge>
        <span className="truncate text-sm font-semibold sm:[writing-mode:vertical-rl]">{label}</span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex w-full shrink-0 flex-col rounded-sm border p-2 transition-colors sm:w-72 ${borda} ${divisa}`}
    >
      <div className="mb-2">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-sm font-semibold">{label}</span>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant="outline" className="font-mono text-[10px]">
              {dados.total}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Recolher coluna ${label}`}
              title={`Recolher ${label}`}
              onClick={onAlternar}
            >
              <ChevronsRightLeft className="size-3.5" />
            </Button>
          </div>
        </div>
        {dados.soma > 0 && <p className="font-mono text-[11px] text-muted-foreground">{brlInteiro(dados.soma)}</p>}
      </div>
      <div className="space-y-2">
        {aguardandoDados ? (
          <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">Carregando…</p>
        ) : dados.cards.length === 0 ? (
          <p className="px-1 py-4 text-center text-[11px] text-muted-foreground/60">—</p>
        ) : (
          dados.cards.map((card) => (
            <FunilComercialCard
              key={chaveCard(card)}
              card={card}
              agora={agora}
              destacado={card.tipo === "NEGOCIACAO" && card.id === alvoId}
              mostrarStatus={dados.coluna === "ENCERRADOS"}
            />
          ))
        )}
        {dados.temMais && (
          <p className="px-1 py-1 text-center text-[10px] text-muted-foreground">
            mostrando {dados.cards.length} de {dados.total}
          </p>
        )}
      </div>
    </div>
  );
}
