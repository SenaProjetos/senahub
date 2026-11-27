"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { completarEquipeNaBaseAction, previaCompletarEquipeNaBase } from "@/modules/planejamento/orcamento-base-actions";
import type { PreviaEquipeNaBase } from "@/modules/planejamento/orcamento-base-service";
import { rotuloBaseline } from "@/modules/planejamento/baselines";
import { rotuloHoras } from "@/modules/planejamento/progresso-sugerido";
import { brl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const h = (v: number | null) => (v == null ? "sem estimativa" : rotuloHoras(v));
const r$ = (v: number | null) => (v == null ? "sem custo" : brl(v));

/**
 * "Completar a equipe na linha de base" (decisão do dono em 26/11/2026): quem entrou na equipe depois de aprovar passa a
 * contar no orçamento (horas e custo) da linha de base, só nas atividades que ainda não começaram. Datas não mudam.
 * A prévia vem do servidor ao abrir — é a mesma conta que a gravação refaz.
 */
export function CompletarEquipeBaseDialog({
  projetoId,
  aberto,
  onAbertoChange,
}: {
  projetoId: string;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [previa, setPrevia] = useState<PreviaEquipeNaBase | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setPrevia(null);
    setErro(null);
    setMotivo("");
    previaCompletarEquipeNaBase({ projetoId })
      .then((r) => {
        if (!vivo) return;
        if (r.ok) setPrevia(r.data);
        else setErro(r.error);
      })
      .catch(() => {
        if (vivo) setErro("Não foi possível calcular a prévia. Feche e tente de novo.");
      });
    return () => {
      vivo = false;
    };
  }, [aberto, projetoId]);

  function gravar() {
    start(async () => {
      const r = await completarEquipeNaBaseAction({ projetoId, motivo });
      if (r.ok) {
        toast.success(
          `${rotuloBaseline(r.data.baselineNumero)} atualizada: ${r.data.atividades === 1 ? "1 atividade" : `${r.data.atividades} atividades`} com a equipe de hoje.`,
          { description: "Datas e duração da linha de base não mudaram." },
        );
        onAbertoChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const nada = previa != null && previa.atividadesAtualizadas === 0;
  const verCusto = previa != null && (previa.custoAntes != null || previa.custoDepois != null || previa.linhas.some((l) => l.custoDepois != null));

  return (
    <Dialog open={aberto} onOpenChange={(o) => !pending && onAbertoChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Completar a equipe na linha de base</DialogTitle>
          <DialogDescription>
            Quem entrou na equipe depois de aprovar passa a contar nas horas e no custo da linha de base
            {previa ? ` (${rotuloBaseline(previa.baselineNumero)})` : ""}. Só nas atividades que ainda não começaram. Início, término e
            duração não mudam.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 text-sm">
          {erro ? (
            <p role="alert" className="text-destructive">
              {erro}
            </p>
          ) : !previa ? (
            <p role="status" className="text-muted-foreground">
              Calculando…
            </p>
          ) : nada ? (
            <p>Nada a completar: nas atividades que ainda não começaram, as horas e o custo de hoje já são os da linha de base.</p>
          ) : (
            <>
              <p>
                <strong>{previa.atividadesAtualizadas === 1 ? "1 atividade muda" : `${previa.atividadesAtualizadas} atividades mudam`}</strong>:{" "}
                {h(previa.horasAntes)} → <strong>{h(previa.horasDepois)}</strong>
                {verCusto && (
                  <>
                    {" "}
                    · {r$(previa.custoAntes)} → <strong>{r$(previa.custoDepois)}</strong>
                  </>
                )}
                . Os totais dos agrupamentos são refeitos pela soma.
              </p>
              <ul
                tabIndex={0}
                aria-label="Atividades que mudam"
                className="max-h-48 divide-y overflow-y-auto rounded-sm border text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {previa.linhas.map((l) => (
                  <li key={l.tarefaId} className="flex flex-wrap items-baseline justify-between gap-x-3 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate" title={l.nome}>
                      {l.nome}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {h(l.horasAntes)} → <span className="text-foreground">{h(l.horasDepois)}</span>
                      {verCusto && ` · ${r$(l.custoAntes)} → ${r$(l.custoDepois)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {previa && previa.iniciadasDiferentes > 0 && (
            <p className="text-xs text-muted-foreground">
              {previa.iniciadasDiferentes === 1 ? "1 atividade já começada também mudou" : `${previa.iniciadasDiferentes} atividades já começadas também mudaram`}{" "}
              de equipe, mas fica{previa.iniciadasDiferentes === 1 ? "" : "m"} com o orçamento da aprovação.
            </p>
          )}
          {previa && !nada && (
            <div className="space-y-1.5">
              <Label htmlFor="motivo-completar-equipe">Motivo</Label>
              <Input
                id="motivo-completar-equipe"
                placeholder="Ex.: entrada do projetista de Drenagem, definido depois da aprovação"
                value={motivo}
                maxLength={500}
                onChange={(e) => setMotivo(e.target.value)}
                aria-describedby="motivo-completar-equipe-ajuda"
                autoFocus
              />
              <p id="motivo-completar-equipe-ajuda" className="text-xs text-muted-foreground">
                Quem entrou e por quê (pelo menos 5 caracteres). Fica no histórico.
              </p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbertoChange(false)} disabled={pending}>
            {nada || erro ? "Fechar" : "Cancelar"}
          </Button>
          {previa && !nada && (
            <Button onClick={gravar} disabled={pending || motivo.trim().length < 5}>
              {pending ? "Gravando…" : "Atualizar a linha de base"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
