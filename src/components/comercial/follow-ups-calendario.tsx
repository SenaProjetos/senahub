"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { reagendarProximaAcao } from "@/modules/comercial/actions";
import type { FollowUpComercial } from "@/modules/comercial/queries";
import {
  agruparPorDia,
  chaveDia,
  diaDaChave,
  diasDaSemana,
  diasDoMes,
  moverParaDia,
  navegar,
  tituloDoPeriodo,
  type VistaCalendario,
} from "@/modules/comercial/follow-ups-calendario";
import { TIPO_PROXIMA_ACAO_LABEL } from "@/modules/agenda/proxima-acao";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { Button } from "@/components/ui/button";
import { cn, formatarData } from "@/lib/utils";
import { useConcluirAcao } from "./acao-linha";

const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MAX_NO_MES = 3;

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Calendário dos follow-ups comerciais. Semana é a vista padrão (follow-up é coisa de dia a dia;
 * o mês apertaria os itens). Atrasados caem em semanas passadas, que ninguém abre por conta
 * própria — por isso viram um aviso no topo que leva à lista, onde aparecem primeiro.
 *
 * **Arrastar reagenda.** Soltar uma ação em outro dia leva o mesmo horário para lá. O movimento é
 * otimista, como no funil: `movidos` sobrepõe o início vindo do servidor só para o que foi
 * arrastado; erro remove a sobreposição e a ação volta sozinha ao dia de origem.
 */
export function FollowUpsCalendario({
  itens,
  podeGerir,
  onVerAtrasados,
}: {
  itens: FollowUpComercial[];
  podeGerir: boolean;
  onVerAtrasados: () => void;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const agora = useMemo(() => new Date(), []);
  const hojeChave = chaveDia(agora);
  const [vista, setVista] = useState<VistaCalendario>("semana");
  const [ref, setRef] = useState<Date>(agora);
  const [arrastando, setArrastando] = useState<FollowUpComercial | null>(null);
  /** id da ação → novo início (ISO), enquanto o servidor não confirma. */
  const [movidos, setMovidos] = useState<Record<string, string>>({});
  // Dados novos do servidor já refletem os movimentos confirmados: a sobreposição otimista cai.
  const [base, setBase] = useState(itens);
  if (base !== itens) {
    setBase(itens);
    setMovidos({});
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const exibidos = useMemo(
    () => itens.map((i) => (movidos[i.id] ? { ...i, inicio: movidos[i.id] } : i)),
    [itens, movidos],
  );
  const porDia = useMemo(() => agruparPorDia(exibidos), [exibidos]);
  const atrasados = useMemo(() => {
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
    return exibidos.filter((i) => new Date(i.inicio).getTime() < inicioHoje).length;
  }, [exibidos, agora]);

  const dias = vista === "semana" ? diasDaSemana(ref) : diasDoMes(ref);

  function onDragEnd(e: DragEndEvent) {
    setArrastando(null);
    const destino = e.over ? String(e.over.id) : null;
    if (!destino) return;
    const id = String(e.active.id);
    const item = exibidos.find((i) => i.id === id);
    if (!item || chaveDia(new Date(item.inicio)) === destino) return;
    // Movimento anterior deste card ainda sem resposta: espera, senão a origem do rollback se perde.
    if (movidos[id]) {
      toast.info("Aguarde o reagendamento anterior terminar.");
      return;
    }

    const novoInicio = moverParaDia(item.inicio, diaDaChave(destino));
    setMovidos((m) => ({ ...m, [id]: novoInicio }));
    start(async () => {
      const r = await reagendarProximaAcao({ compromissoId: id, novoInicio });
      if (r.ok) {
        toast.success(`Reagendado para ${formatarData(novoInicio)}.`);
        router.refresh();
      } else {
        setMovidos((m) => {
          const resto = { ...m };
          delete resto[id];
          return resto;
        });
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {atrasados > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <span className="font-medium text-destructive">{atrasados} ação(ões) atrasada(s)</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={onVerAtrasados}>
            Ver na lista
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="Período anterior" onClick={() => setRef((r) => navegar(r, vista, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRef(new Date())}>
            Hoje
          </Button>
          <Button size="icon" variant="outline" aria-label="Próximo período" onClick={() => setRef((r) => navegar(r, vista, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <h3 className="text-sm font-bold capitalize" aria-live="polite">
          {tituloDoPeriodo(ref, vista)}
        </h3>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Vista do calendário">
          {(["semana", "mes"] as const).map((v) => (
            <Button key={v} size="sm" variant={vista === v ? "secondary" : "outline"} aria-pressed={vista === v} onClick={() => setVista(v)}>
              {v === "semana" ? "Semana" : "Mês"}
            </Button>
          ))}
        </div>
      </div>

      {podeGerir && (
        <p className="text-xs text-muted-foreground">Arraste uma ação pela alça para outro dia para reagendar — o horário se mantém.</p>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setArrastando(exibidos.find((i) => i.id === e.active.id) ?? null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setArrastando(null)}
      >
        <div className={cn("grid gap-2", vista === "semana" ? "sm:grid-cols-2 lg:grid-cols-7" : "grid-cols-7 gap-1")}>
          {vista === "mes" &&
            DIAS_CURTOS.map((d) => (
              <div key={d} className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {d}
              </div>
            ))}
          {dias.map((dia, i) => {
            const chave = chaveDia(dia);
            const doDia = (porDia.get(chave) ?? []).slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
            return (
              <CelulaDia
                key={chave}
                chave={chave}
                titulo={`${vista === "semana" ? `${DIAS_CURTOS[i]} ` : ""}${dia.getDate()}${chave === hojeChave ? " · hoje" : ""}`}
                itens={vista === "mes" ? doDia.slice(0, MAX_NO_MES) : doDia}
                resto={vista === "mes" ? doDia.length - MAX_NO_MES : 0}
                semana={vista === "semana"}
                hoje={chave === hojeChave}
                foraDoMes={vista === "mes" && dia.getMonth() !== ref.getMonth()}
                podeGerir={podeGerir}
                onAbrirSemana={() => {
                  setRef(dia);
                  setVista("semana");
                }}
              />
            );
          })}
        </div>
        <DragOverlay>{arrastando ? <CorpoItem item={arrastando} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function CelulaDia({
  chave,
  titulo,
  itens,
  resto,
  semana,
  hoje,
  foraDoMes,
  podeGerir,
  onAbrirSemana,
}: {
  chave: string;
  titulo: string;
  itens: FollowUpComercial[];
  resto: number;
  semana: boolean;
  hoje: boolean;
  foraDoMes: boolean;
  podeGerir: boolean;
  onAbrirSemana: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: chave, disabled: !podeGerir });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-w-0 rounded-sm border p-1.5 transition-colors",
        semana ? "min-h-28" : "min-h-20",
        hoje && "border-primary bg-primary/5",
        isOver && "border-primary bg-primary/10 ring-2 ring-primary/30",
        foraDoMes && "opacity-50",
      )}
    >
      <p className={cn("mb-1 text-[11px] font-semibold", hoje ? "text-primary" : "text-muted-foreground")}>{titulo}</p>
      <div className="space-y-1">
        {itens.map((it) => (
          <ItemCompacto key={it.id} item={it} comConcluir={semana && podeGerir} arrastavel={podeGerir} />
        ))}
        {resto > 0 && (
          <button
            type="button"
            className="w-full text-left text-[10px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={onAbrirSemana}
          >
            +{resto} mais
          </button>
        )}
        {itens.length === 0 && semana && <p className="text-[11px] text-muted-foreground/50">—</p>}
      </div>
    </div>
  );
}

function ItemCompacto({ item, comConcluir, arrastavel }: { item: FollowUpComercial; comConcluir: boolean; arrastavel: boolean }) {
  const { concluir, pending } = useConcluirAcao(item.id);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: !arrastavel });
  return (
    <div
      ref={setNodeRef}
      className={cn("flex items-start gap-0.5 rounded-sm bg-card px-0.5 py-1 text-[11px] leading-tight ring-1 ring-border", isDragging && "opacity-40")}
    >
      {arrastavel && (
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground"
          aria-label={`Arrastar para reagendar: ${item.cliente}`}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-3" />
        </button>
      )}
      <CorpoItem item={item} />
      {comConcluir && (
        <Button size="icon" variant="ghost" className="size-5 shrink-0" title="Concluir" aria-label="Concluir" disabled={pending} onClick={concluir}>
          <CheckCircle2 className="size-3" />
        </Button>
      )}
    </div>
  );
}

/**
 * Três linhas, cada uma com uma informação: horário + tipo, cliente, demanda. Juntar cliente e
 * demanda numa linha só cortava justamente o nome do empreendimento.
 */
function CorpoItem({ item, overlay }: { item: FollowUpComercial; overlay?: boolean }) {
  const tipo = item.tipo ? TIPO_PROXIMA_ACAO_LABEL[item.tipo] : "Ação";
  const conteudo = (
    <>
      <span className="block truncate">
        <span className="font-mono text-[10px] text-muted-foreground">{hora(item.inicio)}</span>{" "}
        <span className="font-medium">{tipo}</span>
      </span>
      <span className="block truncate">{item.cliente}</span>
      {item.demanda && <span className="block truncate text-muted-foreground">{item.demanda}</span>}
    </>
  );
  const titulo = `${tipo} — ${item.nomeEntidade}`;
  return (
    <>
      {overlay ? (
        <div className="w-44 rounded-sm bg-card px-2 py-1 text-[11px] leading-tight shadow-md ring-1 ring-primary">{conteudo}</div>
      ) : (
        <Link href={item.href} className="min-w-0 flex-1 hover:underline" title={titulo}>
          {conteudo}
        </Link>
      )}
      {!overlay && item.responsavel && (
        <AvatarUsuario
          nome={item.responsavel.name}
          image={item.responsavel.image}
          size="sm"
          title={`Responsável: ${item.responsavel.name}`}
        />
      )}
    </>
  );
}
