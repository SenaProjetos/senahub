"use client";

import type { SugestaoDoPonto } from "@/modules/ponto/tarefa-ponto-service";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Square, Repeat } from "lucide-react";
import {
  abrirApontamentoAction,
  trocarApontamentoAction,
  fecharApontamentoAction,
} from "@/modules/ponto/apontamento-actions";
import { fmtHoras } from "@/modules/ponto/format";
import {
  rotuloDaSessao,
  selecaoDaAlocacaoPonto,
  selecaoEhProjeto,
  tarefaObrigatoria,
  type ProjetoAlocacao,
  type TipoAlocacaoPonto,
} from "@/modules/ponto/alocacao";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { SeletorAlocacao } from "@/components/ponto/seletor-alocacao";
import { SeletorTarefa, useTarefasDoPonto } from "@/components/ponto/seletor-tarefa";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ApontamentoAberto = {
  id: string;
  projetoId: string | null;
  tipoAlocacao: TipoAlocacaoPonto;
  inicio: string | Date;
  projeto: { codigo: string; nome: string } | null;
  tarefa?: { id: string; titulo: string } | null;
};

/** Cronômetro ao vivo do apontamento aberto. */
function useDecorrido(inicio: string | Date | null): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!inicio) {
      setMs(0);
      return;
    }
    const ancora = new Date(inicio).getTime();
    const tick = () => setMs(Date.now() - ancora);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [inicio]);
  return ms;
}

function Relogio({ ms }: { ms: number }) {
  const tot = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(tot / 3600);
  const m = Math.floor((tot % 3600) / 60);
  const s = tot % 60;
  return (
    <span className="font-mono text-4xl font-bold tabular-nums">
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

/**
 * Apontamento de horas — para quem NÃO controla jornada (PJ/freelancer). Sem cronômetro de
 * jornada, sem geolocalização, sem vocabulário de ponto: só "estou trabalhando em X" /
 * "parei". Alimenta o mesmo rateio de sempre (ver modules/ponto/apontamento.ts).
 */
export function ApontamentoHoras({
  aberto,
  hojeMin,
  projetos,
  sugestao = null,
}: {
  /** Sem apontamento aberto: começa no projeto da atividade de hoje (`sugestaoParaPonto`). */
  sugestao?: SugestaoDoPonto | null;
  aberto: ApontamentoAberto | null;
  hojeMin: number;
  projetos: ProjetoAlocacao[];
}) {
  const router = useRouter();
  const [alocacao, setAlocacao] = useState(
    !aberto && sugestao ? sugestao.projeto.id : selecaoDaAlocacaoPonto(aberto?.projetoId ?? null, aberto?.tipoAlocacao ?? "sem_projeto"),
  );
  // Tarefa: segue a do apontamento aberto, ou a atividade sugerida; zera ao escolher outro projeto.
  const [tarefa, setTarefa] = useState(!aberto && sugestao ? sugestao.tarefa.id : (aberto?.tarefa?.id ?? ""));
  const tarefasDoDestino = useTarefasDoPonto(
    selecaoEhProjeto(alocacao) ? alocacao : null,
    alocacao === aberto?.projetoId ? (aberto?.tarefa ?? null) : null,
  );
  const exigeTarefa = tarefaObrigatoria(alocacao, projetos, tarefasDoDestino?.length);
  const faltaTarefa = exigeTarefa && !tarefa;
  const [pending, start] = useTransition();
  const decorrido = useDecorrido(aberto?.inicio ?? null);

  function iniciar() {
    start(async () => {
      const r = await abrirApontamentoAction({ projetoId: alocacao, tarefaId: tarefa });
      if (r.ok) {
        toast.success("Apontamento iniciado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function trocar() {
    start(async () => {
      const r = await trocarApontamentoAction({ projetoId: alocacao, tarefaId: tarefa });
      if (r.ok) {
        toast.success("Alocação atualizada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function encerrar() {
    start(async () => {
      const r = await fecharApontamentoAction({});
      if (r.ok) {
        toast.success("Apontamento encerrado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 py-6">
        <p className="text-center text-xs text-muted-foreground">
          Registro de horas por projeto — alimenta o rateio. Não é controle de jornada.
        </p>

        <div className="flex flex-col items-center gap-2">
          <Relogio ms={decorrido} />
          <p className="text-xs text-muted-foreground">
            {aberto
              ? `Em andamento · ${rotuloDaSessao(aberto.tipoAlocacao, aberto.projeto ? `${formatarCodigo(aberto.projeto.codigo)} ${aberto.projeto.nome}` : null)}`
              : "Parado"}
            {" · "}Hoje: {fmtHoras(hojeMin)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <SeletorAlocacao
            value={alocacao}
            projetos={projetos}
            triggerClassName="w-64"
            placeholder="Alocação…"
            ariaLabel="Alocação do apontamento"
            onChange={(v) => {
              setAlocacao(v);
              setTarefa(v === selecaoDaAlocacaoPonto(aberto?.projetoId ?? null, aberto?.tipoAlocacao ?? "sem_projeto") ? (aberto?.tarefa?.id ?? "") : "");
            }}
          />
          {selecaoEhProjeto(alocacao) && (
            <div className="w-64">
              <SeletorTarefa
                opcoes={tarefasDoDestino}
                value={tarefa}
                onChange={setTarefa}
                disabled={pending}
                obrigatoria={exigeTarefa}
              />
            </div>
          )}
          {aberto && (
            <Button variant="outline" disabled={pending || faltaTarefa} onClick={trocar}>
              <Repeat className="size-4" /> Trocar alocação
            </Button>
          )}
        </div>

        <div className="flex items-center justify-center gap-2">
          {aberto ? (
            <Button variant="destructive" disabled={pending} onClick={encerrar}>
              <Square className="size-4" /> Encerrar apontamento
            </Button>
          ) : (
            <Button disabled={pending || faltaTarefa} onClick={iniciar}>
              <Play className="size-4" /> Iniciar apontamento
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
