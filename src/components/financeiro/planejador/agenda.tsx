"use client";

import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { SeloConfianca, SeloPrioridade } from "@/components/financeiro/selos";
import { Valor } from "@/components/financeiro/valor";
import { brlC, rotuloDia } from "@/components/financeiro/planejador/formato";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import type { EventoProjetado } from "@/modules/financeiro/liquidez/motor";
import type { DataIso, EventoCaixa } from "@/modules/financeiro/liquidez/tipos";
import { cn } from "@/lib/utils";

/** Uma linha da agenda, já com o estado da projeção e o menu montado pela tela. */
export type LinhaAgenda = {
  evento: EventoCaixa;
  projetado: EventoProjetado;
  noCenario: boolean;
  itens: AcaoItem[];
};

export type GrupoAgenda = {
  chave: string;
  titulo: string;
  /** "saldo após o dia" ou a explicação do grupo de vencidos. */
  legenda: string;
  saldo: number | null;
  marca: { texto: string; tom: "erro" | "alerta" } | null;
  linhas: LinhaAgenda[];
};

/** Monta os grupos por dia (vencidos primeiro) a partir da projeção. Só o que cai no horizonte. */
export function gruposDaAgenda(
  eventos: readonly EventoCaixa[],
  projetados: readonly EventoProjetado[],
  serie: readonly { dia: DataIso; saldo: number }[],
  reservaMinima: number,
  noCenario: (e: EventoCaixa) => boolean,
  itensDe: (e: EventoCaixa, noCenario: boolean) => AcaoItem[],
  fim: DataIso,
): GrupoAgenda[] {
  const porId = new Map(projetados.map((p) => [p.id, p]));
  const saldoDoDia = new Map(serie.map((d) => [d.dia, d.saldo]));
  const linha = (e: EventoCaixa): LinhaAgenda => {
    const nc = noCenario(e);
    return { evento: e, projetado: porId.get(e.id)!, noCenario: nc, itens: itensDe(e, nc) };
  };
  const ordenar = (a: EventoCaixa, b: EventoCaixa) =>
    a.tipo === b.tipo ? b.valor - a.valor || (a.id < b.id ? -1 : 1) : a.tipo === "despesa" ? -1 : 1;

  const grupos: GrupoAgenda[] = [];
  const vencidos = eventos.filter((e) => e.vencido).sort(ordenar);
  if (vencidos.length) {
    grupos.push({ chave: "vencidos", titulo: "Vencidos, sem data nova", legenda: "entram hoje, se o cenário os incluir", saldo: null, marca: null, linhas: vencidos.map(linha) });
  }
  const porDia = new Map<DataIso, EventoCaixa[]>();
  for (const e of eventos) {
    if (e.vencido || e.data > fim) continue;
    const l = porDia.get(e.data) ?? [];
    l.push(e);
    porDia.set(e.data, l);
  }
  for (const dia of [...porDia.keys()].sort()) {
    const saldo = saldoDoDia.get(dia) ?? null;
    const marca = saldo == null ? null : saldo < 0 ? ({ texto: "Déficit", tom: "erro" } as const) : saldo < reservaMinima ? ({ texto: "Abaixo da reserva", tom: "alerta" } as const) : null;
    grupos.push({ chave: dia, titulo: rotuloDia(dia), legenda: "saldo após o dia", saldo, marca, linhas: porDia.get(dia)!.sort(ordenar).map(linha) });
  }
  return grupos;
}

const ROTULO_STATUS: Record<string, string> = {
  aguardando_aprovacao: "Aguardando aprovação",
  previsao: "Previsão do cronograma",
};

function Marca({ children, tom }: { children: React.ReactNode; tom?: "info" | "alerta" | "erro" | "neutro" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-sm border px-2 text-xs font-semibold",
        tom === "info" && "border-info text-info",
        tom === "alerta" && "border-warning text-warning",
        tom === "erro" && "border-destructive text-destructive",
        (!tom || tom === "neutro") && "border-border text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** Marcas da linha: o que a simulação fez com ela, ou a situação real que importa. */
function marcasDaLinha(l: LinhaAgenda): { texto: string; tom: "info" | "alerta" | "erro" | "neutro" }[] {
  const e = l.evento;
  const s = e.simulacao;
  const r: { texto: string; tom: "info" | "alerta" | "erro" | "neutro" }[] = [];
  if (e.origem === "simulado") r.push({ texto: "Simulado", tom: "info" });
  if (s?.excluido) r.push({ texto: "Tirado da simulação", tom: "neutro" });
  else if (s?.forcado && e.origem !== "simulado") r.push({ texto: "Incluído à mão", tom: "info" });
  else if (!l.noCenario && e.origem !== "simulado") r.push({ texto: "Fora do cenário", tom: "neutro" });
  if (s?.dataOriginal) r.push({ texto: `Simulado: era ${diaMes(s.dataOriginal)}`, tom: "info" });
  if (e.natureza === "transferencia") r.push({ texto: "Transferência entre contas", tom: "neutro" });
  if (e.natureza === "fora_do_resultado") r.push({ texto: "Fora do resultado", tom: "neutro" });
  if (e.vencido && !s?.dataOriginal) r.push({ texto: "Vencido", tom: "erro" });
  if (e.status && ROTULO_STATUS[e.status]) r.push({ texto: ROTULO_STATUS[e.status], tom: e.status === "aguardando_aprovacao" ? "alerta" : "info" });
  return r;
}

export function LinhaDaAgenda({
  linha,
  onSelect,
  onAbrir,
}: {
  linha: LinhaAgenda;
  onSelect: (e: EventoCaixa, item: AcaoItemAcao) => void;
  onAbrir: (e: EventoCaixa) => void;
}) {
  const e = linha.evento;
  const fora = !linha.projetado?.aplicado;
  const det = [e.favorecido, e.projeto, e.categoriaNome].filter(Boolean).join(" · ");
  return (
    <LinhaComMenu
      itens={linha.itens}
      onSelect={(item) => onSelect(e, item)}
      render={
        <div
          className={cn(
            // Celular: quebra em linhas. Do sm em diante, colunas fixas (como o mock): a descrição
            // encolhe e o ⋯ nunca desce para outra linha quando a linha tem muitas marcas.
            "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm px-1 py-1.5 hover:bg-muted/40 data-[popup-open]:bg-muted/50 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_9rem_2rem]",
            fora && "opacity-60",
          )}
        />
      }
    >
      <button
        type="button"
        onClick={() => onAbrir(e)}
        className="flex min-w-0 flex-[1_1_16rem] items-center gap-2.5 text-left"
      >
        <span aria-hidden className={cn("w-4 text-center font-mono font-bold", e.tipo === "receita" ? "text-success" : "text-destructive")}>
          {e.tipo === "receita" ? "+" : "−"}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{e.descricao}</span>
          {det && <span className="block truncate text-[12.5px] text-muted-foreground">{det}</span>}
        </span>
      </button>
      <span className="flex flex-wrap items-center justify-end gap-1.5 sm:max-w-72">
        {e.tipo === "despesa" && e.prioridade && e.natureza !== "transferencia" && <SeloPrioridade prioridade={e.prioridade} />}
        {e.tipo === "receita" && e.confianca && e.natureza !== "transferencia" && <SeloConfianca confianca={e.confianca} />}
        {marcasDaLinha(linha).map((m) => (
          <Marca key={m.texto} tom={m.tom}>
            {m.texto}
          </Marca>
        ))}
      </span>
      <Valor
        valor={(e.tipo === "receita" ? e.valor : -e.valor) / 100}
        className={cn("ml-auto font-semibold sm:text-right", e.simulacao?.excluido && "line-through")}
      />
      <BotaoAcoes itens={linha.itens} onSelect={(item) => onSelect(e, item)} rotulo={`Ações de ${e.descricao}`} className="size-8" />
    </LinhaComMenu>
  );
}

export function Agenda({
  grupos,
  onSelect,
  onAbrir,
  alemDoHorizonte,
}: {
  grupos: GrupoAgenda[];
  onSelect: (e: EventoCaixa, item: AcaoItemAcao) => void;
  onAbrir: (e: EventoCaixa) => void;
  alemDoHorizonte: number;
}) {
  if (grupos.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhum movimento pendente neste horizonte.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {grupos.map((g) => (
        <section key={g.chave} aria-label={g.titulo}>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-1.5 pt-3">
            <h3 className="text-sm font-bold">{g.titulo}</h3>
            <span className="flex items-center gap-2 text-[13px]">
              {g.marca && <Marca tom={g.marca.tom}>{g.marca.texto}</Marca>}
              <span className="text-muted-foreground">{g.legenda}</span>
              {g.saldo !== null && <span className="font-mono font-semibold">{brlC(g.saldo)}</span>}
            </span>
          </header>
          {g.linhas.map((l) => (
            <LinhaDaAgenda key={l.evento.id} linha={l} onSelect={onSelect} onAbrir={onAbrir} />
          ))}
        </section>
      ))}
      {alemDoHorizonte > 0 && (
        <p className="pt-3 text-[12.5px] text-muted-foreground">
          {alemDoHorizonte} {alemDoHorizonte === 1 ? "movimento vence" : "movimentos vencem"} depois deste horizonte. Aumente o horizonte para vê-los.
        </p>
      )}
    </div>
  );
}
