"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListTree } from "lucide-react";
import { gerarEapDasDisciplinas } from "@/modules/planejamento/actions";
import type { OpcaoDeDisciplina } from "@/modules/planejamento/modelos/disciplina-service";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const selectCls =
  "h-8 w-full min-w-0 rounded-sm border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-72";

/** Valor do seletor para "sem modelo" (o `<select>` não guarda `null`). */
const LINHA_UNICA = "";

/**
 * "Gerar EAP das disciplinas" (pedido do dono, 2026-09-27): como o "Usar modelo de EAP", mas por disciplina. Cada
 * disciplina do projeto sem tarefa na EAP aparece com o modelo de disciplina pré-escolhido (o do tipo do projeto,
 * senão o geral) e quantas linhas ele cria; sem modelo, entra uma linha só, até o prazo dela (o de antes).
 */
export function GerarEapDisciplinasDialog({
  projetoId,
  opcoes,
  variante = "outline",
  tamanho = "sm",
}: {
  projetoId: string;
  opcoes: OpcaoDeDisciplina[];
  variante?: "default" | "outline";
  tamanho?: "default" | "sm";
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useTransition();
  const [incluir, setIncluir] = useState<Record<string, boolean>>(() => Object.fromEntries(opcoes.map((o) => [o.disciplinaId, true])));
  const [escolha, setEscolha] = useState<Record<string, string>>(() =>
    Object.fromEntries(opcoes.map((o) => [o.disciplinaId, o.padraoId ?? LINHA_UNICA])),
  );

  const linhasDe = (o: OpcaoDeDisciplina) => {
    const m = o.modelos.find((x) => x.id === escolha[o.disciplinaId]);
    return m ? m.linhas : 1;
  };
  const marcadas = opcoes.filter((o) => incluir[o.disciplinaId]);
  const total = marcadas.reduce((s, o) => s + linhasDe(o), 0);
  const algumModelo = opcoes.some((o) => o.modelos.length > 0);

  function gerar() {
    start(async () => {
      const r = await gerarEapDasDisciplinas({
        projetoId,
        escolhas: marcadas.map((o) => ({ disciplinaId: o.disciplinaId, modeloId: escolha[o.disciplinaId] || null })),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${r.data.criadas} linha(s) criada(s) em ${r.data.disciplinas} disciplina(s).`, {
        description: r.data.comModelo > 0 ? `${r.data.comModelo} a partir de modelo de disciplina.` : undefined,
      });
      setAberto(false);
      router.refresh();
    });
  }

  const vazio = opcoes.length === 0;
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button
            size={tamanho}
            variant={variante}
            disabled={vazio}
            title={vazio ? "Todas as disciplinas já têm tarefa na EAP." : undefined}
          />
        }
      >
        <ListTree className="size-3.5" /> Gerar EAP das disciplinas
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar EAP das disciplinas</DialogTitle>
          <DialogDescription>
            Cada disciplina sem tarefa na EAP ganha o conteúdo do modelo de disciplina escolhido — fases e tarefas, com os
            vínculos. Sem modelo, ela entra como uma linha só, até o prazo dela.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <ul className="divide-y rounded-sm border">
            {opcoes.map((o) => (
              <li key={o.disciplinaId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={incluir[o.disciplinaId]}
                    onCheckedChange={(v) => setIncluir({ ...incluir, [o.disciplinaId]: v === true })}
                  />
                  <span className="truncate">{o.nome}</span>
                </label>
                {o.modelos.length > 0 ? (
                  <select
                    aria-label={`Modelo para ${o.nome}`}
                    className={selectCls}
                    value={escolha[o.disciplinaId]}
                    disabled={!incluir[o.disciplinaId]}
                    onChange={(e) => setEscolha({ ...escolha, [o.disciplinaId]: e.target.value })}
                  >
                    {o.modelos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome} · {m.linhas} linhas
                      </option>
                    ))}
                    <option value={LINHA_UNICA}>Linha única (sem modelo)</option>
                  </select>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {o.noCatalogo ? "Sem modelo desta disciplina: linha única" : "Fora do catálogo de disciplinas: linha única"}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!algumModelo && (
            <p className="text-xs text-muted-foreground">
              Nenhuma destas disciplinas tem modelo. Crie em Modelos de EAP: abra um modelo de projeto e use{" "}
              <strong>Criar modelos de disciplina</strong>.
            </p>
          )}
          <p className="text-sm">
            Vai criar <strong className="tabular-nums">{total}</strong> linha(s) em{" "}
            <strong className="tabular-nums">{marcadas.length}</strong> disciplina(s). As datas saem do motor, a partir do
            início do cronograma.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={gerar} disabled={pending || marcadas.length === 0}>
            {pending ? "Gerando…" : "Gerar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
