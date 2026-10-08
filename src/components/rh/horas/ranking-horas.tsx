"use client";

import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import {
  ACAO_COMPARAR,
  ACAO_POR_PROJETO,
  ACAO_TIRAR,
  itensDoRankingDeHoras,
  LIMITE_COMPARACAO,
  MOTIVO_LIMITE_COMPARACAO,
} from "@/modules/rh/produtividade/acoes-horas";
import type { PessoaHoras } from "@/modules/rh/produtividade/queries";
import { rotuloHoras } from "./formato";

/** Todos com horas no período, do maior total para o menor. Clicar no nome entra/sai da comparação. */
export function RankingHoras({
  pessoas,
  selecionados,
  cores,
  podeVerEspelho,
  onAlternar,
  onSoEste,
}: {
  pessoas: PessoaHoras[];
  selecionados: string[];
  cores: Record<string, string>;
  podeVerEspelho: boolean;
  onAlternar: (userId: string) => void;
  onSoEste: (userId: string) => void;
}) {
  const maximo = Math.max(1, ...pessoas.map((p) => p.totalHoras));
  return (
    <ul className="min-w-0 self-start divide-y rounded-sm border" aria-label="Ranking de horas no período">
      {pessoas.map((p) => (
        <LinhaRanking
          key={p.userId}
          pessoa={p}
          maximo={maximo}
          selecionado={selecionados.includes(p.userId)}
          totalSelecionados={selecionados.length}
          cor={cores[p.userId]}
          podeVerEspelho={podeVerEspelho}
          onAlternar={onAlternar}
          onSoEste={onSoEste}
        />
      ))}
    </ul>
  );
}

function LinhaRanking({
  pessoa: p,
  maximo,
  selecionado,
  totalSelecionados,
  cor,
  podeVerEspelho,
  onAlternar,
  onSoEste,
}: {
  pessoa: PessoaHoras;
  maximo: number;
  selecionado: boolean;
  totalSelecionados: number;
  cor: string | undefined;
  podeVerEspelho: boolean;
  onAlternar: (userId: string) => void;
  onSoEste: (userId: string) => void;
}) {
  const itens = itensDoRankingDeHoras({ userId: p.userId, selecionado, totalSelecionados, podeVerEspelho });
  const aoSelecionar = (item: AcaoItemAcao) => {
    if (item.id === ACAO_COMPARAR || item.id === ACAO_TIRAR) onAlternar(p.userId);
    if (item.id === ACAO_POR_PROJETO) onSoEste(p.userId);
  };
  const bloqueado = !selecionado && totalSelecionados >= LIMITE_COMPARACAO;

  return (
    <LinhaComMenu itens={itens} onSelect={aoSelecionar} render={<li className="data-[popup-open]:bg-muted/50" />}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1.5 px-3 py-2">
        <button
          type="button"
          aria-pressed={selecionado}
          disabled={bloqueado}
          title={bloqueado ? MOTIVO_LIMITE_COMPARACAO : undefined}
          onClick={() => onAlternar(p.userId)}
          className="flex min-w-0 items-center gap-2 rounded-sm text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            className="size-2.5 shrink-0 rounded-full border border-muted-foreground/40"
            style={selecionado && cor ? { background: cor, borderColor: cor } : undefined}
            aria-hidden
          />
          <span className="truncate font-medium">{p.nome}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">{ROLE_LABELS[p.role as Role] ?? p.role}</span>
        </button>
        <div className="text-right text-xs tabular-nums">
          <span className="font-mono text-sm font-semibold">{rotuloHoras(p.totalHoras)}</span>
          <span className="block text-muted-foreground">
            {rotuloHoras(p.mediaPorDiaComRegistro)}/dia · {p.diasComRegistro} {p.diasComRegistro === 1 ? "dia" : "dias"}
          </span>
        </div>
        <BotaoAcoes itens={itens} onSelect={aoSelecionar} rotulo={`Ações de ${p.nome}`} />
        <div className="col-span-3 h-1.5 rounded-full bg-muted" aria-hidden>
          <div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(p.totalHoras / maximo) * 100}%` }} />
        </div>
      </div>
    </LinhaComMenu>
  );
}
