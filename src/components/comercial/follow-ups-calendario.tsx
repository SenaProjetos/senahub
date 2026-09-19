"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import type { FollowUpComercial } from "@/modules/comercial/queries";
import {
  agruparPorDia,
  chaveDia,
  diasDaSemana,
  diasDoMes,
  navegar,
  tituloDoPeriodo,
  type VistaCalendario,
} from "@/modules/comercial/follow-ups-calendario";
import { TIPO_PROXIMA_ACAO_LABEL } from "@/modules/agenda/proxima-acao";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useConcluirAcao } from "./acao-linha";

const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MAX_NO_MES = 3;

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Calendário dos follow-ups comerciais. Semana é a vista padrão (follow-up é coisa de dia a dia;
 * o mês apertaria os itens). Atrasados caem em semanas passadas, que ninguém abre por conta
 * própria — por isso viram um aviso no topo que leva à lista, onde aparecem primeiro.
 */
export function FollowUpsCalendario({
  itens,
  onVerAtrasados,
}: {
  itens: FollowUpComercial[];
  onVerAtrasados: () => void;
}) {
  const agora = useMemo(() => new Date(), []);
  const hojeChave = chaveDia(agora);
  const [vista, setVista] = useState<VistaCalendario>("semana");
  const [ref, setRef] = useState<Date>(agora);

  const porDia = useMemo(() => agruparPorDia(itens), [itens]);
  const atrasados = useMemo(() => {
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
    return itens.filter((i) => new Date(i.inicio).getTime() < inicioHoje).length;
  }, [itens, agora]);

  const dias = vista === "semana" ? diasDaSemana(ref) : diasDoMes(ref);

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
          const hoje = chave === hojeChave;
          const foraDoMes = vista === "mes" && dia.getMonth() !== ref.getMonth();
          const mostrar = vista === "mes" ? doDia.slice(0, MAX_NO_MES) : doDia;
          const resto = doDia.length - mostrar.length;
          return (
            <div
              key={chave}
              className={cn(
                "min-w-0 rounded-sm border p-1.5",
                vista === "semana" ? "min-h-28" : "min-h-20",
                hoje && "border-primary bg-primary/5",
                foraDoMes && "opacity-50",
              )}
            >
              <p className={cn("mb-1 text-[11px] font-semibold", hoje ? "text-primary" : "text-muted-foreground")}>
                {vista === "semana" ? `${DIAS_CURTOS[i]} ` : ""}
                {dia.getDate()}
                {hoje && " · hoje"}
              </p>
              <div className="space-y-1">
                {mostrar.map((it) => (
                  <ItemCompacto key={it.id} item={it} comConcluir={vista === "semana"} />
                ))}
                {resto > 0 && (
                  <button
                    type="button"
                    className="w-full text-left text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => {
                      setRef(dia);
                      setVista("semana");
                    }}
                  >
                    +{resto} mais
                  </button>
                )}
                {doDia.length === 0 && vista === "semana" && <p className="text-[11px] text-muted-foreground/50">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemCompacto({ item, comConcluir }: { item: FollowUpComercial; comConcluir: boolean }) {
  const { concluir, pending } = useConcluirAcao(item.id);
  const tipo = item.tipo ? TIPO_PROXIMA_ACAO_LABEL[item.tipo] : "Ação";
  return (
    <div className="flex items-start gap-1 rounded-sm bg-card px-1 py-0.5 text-[11px] leading-tight ring-1 ring-border">
      <Link href={item.href} className="min-w-0 flex-1 hover:underline" title={`${tipo} — ${item.nomeEntidade}`}>
        <span className="font-mono text-[10px] text-muted-foreground">{hora(item.inicio)}</span>{" "}
        <span className="font-medium">{tipo}</span>
        <span className="block truncate text-muted-foreground">{item.nomeEntidade}</span>
      </Link>
      {item.responsavel && (
        <AvatarUsuario
          nome={item.responsavel.name}
          image={item.responsavel.image}
          size="sm"
          title={`Responsável: ${item.responsavel.name}`}
        />
      )}
      {comConcluir && (
        <Button size="icon" variant="ghost" className="size-5 shrink-0" title="Concluir" aria-label="Concluir" disabled={pending} onClick={concluir}>
          <CheckCircle2 className="size-3" />
        </Button>
      )}
    </div>
  );
}
