"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { aplicarEscolha, opcoesDePredecessora } from "@/modules/planejamento/arvore-predecessoras";
import { formatarPredecessoras, type Vinculo } from "@/modules/planejamento/gantt-linhas";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type LinhaDaArvore = { id: string; parentId: string | null; ordem: number; codigo: string; nome: string; tipoEap: string };

/**
 * Escolher as predecessoras de uma linha numa ÁRVORE de todas as tarefas (em vez de digitar o código). Marca e desmarca;
 * as que não podem ser predecessoras (a própria, a mãe, uma subtarefa, quem fecharia um ciclo) aparecem desabilitadas com
 * o motivo. **Aplicar** grava o conjunto inteiro pelo mesmo caminho da célula (`onAplicar` devolve o erro do servidor, ou
 * `null`): quem já era predecessora mantém o tipo e o atraso; quem entra é término→início sem atraso — o tipo e o atraso
 * se ajustam no texto da célula (`1.2TI+2d`) ou na janela da linha.
 */
export function PredecessorasDialog({
  tarefa,
  linhas,
  dependencias,
  vinculosAtuais,
  onAplicar,
  onFechar,
}: {
  /** A linha editada; `null` = fechado. */
  tarefa: { id: string; nome: string; codigo: string } | null;
  linhas: readonly LinhaDaArvore[];
  dependencias: readonly { tarefaId: string; predecessoraId: string }[];
  vinculosAtuais: readonly Vinculo[];
  onAplicar: (vinculos: Vinculo[]) => Promise<string | null>;
  onFechar: () => void;
}) {
  return (
    <Dialog open={tarefa != null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-xl">
        {tarefa && (
          <Interno key={tarefa.id} tarefa={tarefa} linhas={linhas} dependencias={dependencias} vinculosAtuais={vinculosAtuais} onAplicar={onAplicar} onFechar={onFechar} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Interno({
  tarefa,
  linhas,
  dependencias,
  vinculosAtuais,
  onAplicar,
  onFechar,
}: {
  tarefa: { id: string; nome: string; codigo: string };
  linhas: readonly LinhaDaArvore[];
  dependencias: readonly { tarefaId: string; predecessoraId: string }[];
  vinculosAtuais: readonly Vinculo[];
  onAplicar: (vinculos: Vinculo[]) => Promise<string | null>;
  onFechar: () => void;
}) {
  const [escolhidas, setEscolhidas] = useState<ReadonlySet<string>>(() => new Set(vinculosAtuais.map((v) => v.predecessoraId)));
  const [recolhidas, setRecolhidas] = useState<ReadonlySet<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);

  const opcoes = useMemo(() => opcoesDePredecessora({ linhas, dependencias, linhaId: tarefa.id }), [linhas, dependencias, tarefa.id]);
  const comFilhas = useMemo(() => new Set(opcoes.flatMap((o, i) => (opcoes[i + 1] && opcoes[i + 1].nivel > o.nivel ? [o.id] : []))), [opcoes]);

  // Com busca: só as linhas que casam (código ou nome), em lista. Sem busca: a árvore, com as recolhidas escondendo as filhas.
  const termo = busca.trim().toLowerCase();
  const visiveis = useMemo(() => {
    if (termo) return opcoes.filter((o) => o.codigo.toLowerCase().includes(termo) || o.nome.toLowerCase().includes(termo));
    const out: typeof opcoes = [];
    let escondeAbaixoDe: number | null = null;
    for (const o of opcoes) {
      if (escondeAbaixoDe != null) {
        if (o.nivel > escondeAbaixoDe) continue;
        escondeAbaixoDe = null;
      }
      out.push(o);
      if (recolhidas.has(o.id)) escondeAbaixoDe = o.nivel;
    }
    return out;
  }, [opcoes, termo, recolhidas]);

  const alternar = (id: string, marcar: boolean) =>
    setEscolhidas((atual) => {
      const proxima = new Set(atual);
      if (marcar) proxima.add(id);
      else proxima.delete(id);
      return proxima;
    });

  async function aplicar() {
    setSalvando(true);
    try {
      const erro = await onAplicar(aplicarEscolha(vinculosAtuais, escolhidas));
      if (erro) return void toast.error(erro);
      onFechar();
    } catch {
      toast.error("Não foi possível gravar as predecessoras. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  const codigoPorId = new Map(linhas.map((l) => [l.id, l.codigo]));
  const resumo = formatarPredecessoras(aplicarEscolha(vinculosAtuais, escolhidas), codigoPorId);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Predecessoras de {tarefa.codigo} · {tarefa.nome}
        </DialogTitle>
        <DialogDescription>Marque as tarefas que precisam terminar antes desta começar. As que aparecem apagadas não podem ser escolhidas (o motivo aparece ao passar o mouse); um vínculo antigo com elas continua marcado e pode ser desmarcado.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-3">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código ou nome" aria-label="Buscar tarefa por código ou nome" />
        <ul className="max-h-80 overflow-auto rounded-sm border text-sm" aria-label="Tarefas do cronograma">
          {visiveis.length === 0 && (
            <li className="px-3 py-3 text-muted-foreground">
              {termo ? "Nenhuma tarefa com esse código ou nome." : "Não há outras tarefas no cronograma para escolher."}
            </li>
          )}
          {visiveis.map((o) => (
            <li key={o.id} className="flex items-center gap-1 border-b px-2 py-1 last:border-b-0" style={{ paddingLeft: 8 + (termo ? 0 : o.nivel) * 18 }}>
              {!termo && comFilhas.has(o.id) ? (
                <button
                  type="button"
                  className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-muted"
                  aria-label={recolhidas.has(o.id) ? `Expandir ${o.nome}` : `Recolher ${o.nome}`}
                  aria-expanded={!recolhidas.has(o.id)}
                  onClick={() =>
                    setRecolhidas((atual) => {
                      const proxima = new Set(atual);
                      if (!proxima.delete(o.id)) proxima.add(o.id);
                      return proxima;
                    })
                  }
                >
                  {recolhidas.has(o.id) ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>
              ) : (
                <span className="size-5 shrink-0" aria-hidden />
              )}
              <label className={`flex min-w-0 flex-1 items-center gap-2 ${o.desabilitada && !escolhidas.has(o.id) ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`} title={o.desabilitada ?? undefined}>
                <Checkbox checked={escolhidas.has(o.id)} disabled={!!o.desabilitada && !escolhidas.has(o.id)} onCheckedChange={(v) => alternar(o.id, v === true)} aria-label={`${o.codigo} ${o.nome}`} />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{o.codigo}</span>
                <span className="min-w-0 truncate">{o.nome}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {escolhidas.size === 0 ? "Nenhuma predecessora escolhida." : `Ficará: ${resumo || "—"}`}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void aplicar()} disabled={salvando}>
          {salvando ? "Salvando…" : "Aplicar"}
        </Button>
      </DialogFooter>
    </>
  );
}
