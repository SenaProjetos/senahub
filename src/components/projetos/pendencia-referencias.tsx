"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpRight, CornerDownRight, Link2, Loader2, Trash2 } from "lucide-react";
import {
  buscarAlvosReferencia,
  referenciarPendencia,
  removerReferenciaPendencia,
} from "@/modules/projetos/pendencias/actions";
import type { AlvoReferenciaView, ReferenciaView } from "@/modules/projetos/pendencias/queries";
import { STATUS_LABEL, type StatusPendencia } from "@/modules/projetos/pendencias/helpers";
import { Button } from "@/components/ui/button";

/**
 * Referências cruzadas de UM apontamento (item 13) — "este problema é o mesmo do #12 da ARQ".
 *
 * Mostra as duas direções na mesma lista, com ícone diferente: o que ESTE apontamento cita e o
 * que cita ELE. A ligação é gravada com direção, mas esconder o lado "citado por" deixaria a
 * informação invisível justamente pra quem precisa agir sobre o apontamento citado.
 *
 * O link aponta pra revisão VIGENTE da outra prancha (resolvida no servidor) com `?pin=<numero>`,
 * o mesmo deep-link que a notificação usa.
 */
export function PendenciaReferencias({
  pendenciaId,
  referencias,
  currentUserId,
  ehAdmin,
  onMudou,
}: {
  pendenciaId: string;
  referencias: ReferenciaView[];
  currentUserId: string;
  ehAdmin: boolean;
  onMudou: (referencias: ReferenciaView[]) => void;
}) {
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [alvos, setAlvos] = useState<AlvoReferenciaView[]>([]);
  const [buscando, setBuscando] = useState(false);
  // Cada digitação dispara uma busca; sem cancelar a anterior, a resposta lenta de um termo
  // curto chega DEPOIS da do termo longo e sobrescreve a lista com o resultado errado.
  const buscaId = useRef(0);

  useEffect(() => {
    if (!aberto) return;
    const meu = ++buscaId.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await buscarAlvosReferencia({ origemId: pendenciaId, termo });
      if (meu !== buscaId.current) return;
      setBuscando(false);
      if (r.ok) setAlvos(r.data.itens);
      else toast.error(r.error);
    }, 250);
    return () => clearTimeout(t);
  }, [aberto, termo, pendenciaId]);

  function ligar(alvo: AlvoReferenciaView) {
    start(async () => {
      const r = await referenciarPendencia({ origemId: pendenciaId, destinoId: alvo.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setAberto(false);
      setTermo("");
      toast.success(`Ligado ao apontamento #${alvo.numero}.`);
      // O `uploadId` vigente e o nome do arquivo do alvo só o servidor resolve; até o
      // revalidate chegar, mostra a linha apontando pra própria busca (dados que já temos).
      onMudou([
        ...referencias,
        {
          id: r.data.id,
          direcao: "feita",
          nota: null,
          pendenciaId: alvo.id,
          numero: alvo.numero,
          texto: alvo.texto,
          status: alvo.status,
          severidade: alvo.severidade,
          pagina: 1,
          projetoId: r.data.projetoId,
          uploadId: "",
          disciplinaNome: alvo.disciplinaNome,
          arquivo: alvo.arquivo,
          autorId: currentUserId,
        },
      ]);
    });
  }

  function desligar(id: string) {
    start(async () => {
      const r = await removerReferenciaPendencia({ id });
      if (r.ok) onMudou(referencias.filter((x) => x.id !== id));
      else toast.error(r.error);
    });
  }

  return (
    <div className="mt-1.5 space-y-1" onClick={(e) => e.stopPropagation()}>
      {referencias.map((ref) => {
        const podeRemover = ref.autorId === currentUserId || ehAdmin;
        const rotuloStatus = STATUS_LABEL[ref.status as StatusPendencia] ?? ref.status;
        const conteudo = (
          <>
            {ref.direcao === "feita" ? (
              <ArrowUpRight className="size-3 shrink-0" />
            ) : (
              <CornerDownRight className="size-3 shrink-0" />
            )}
            <span className="font-medium">#{ref.numero}</span>
            <span className="truncate">{ref.texto}</span>
          </>
        );
        return (
          <div key={ref.id} className="group/ref flex items-start gap-1.5 text-[11px]">
            <div className="min-w-0 flex-1">
              {ref.uploadId ? (
                <Link
                  href={`/projetos/${ref.projetoId}/arquivos/${ref.uploadId}/visualizar?pagina=${ref.pagina}&pin=${ref.numero}`}
                  className="inline-flex w-full items-center gap-1 text-primary hover:underline"
                  title={`${ref.direcao === "feita" ? "Aponta para" : "Citado por"} #${ref.numero} · ${ref.disciplinaNome} · ${ref.arquivo} · ${rotuloStatus}`}
                >
                  {conteudo}
                </Link>
              ) : (
                <span className="inline-flex w-full items-center gap-1 text-muted-foreground">{conteudo}</span>
              )}
              <span className="block truncate pl-4 text-[10px] text-muted-foreground">
                {ref.disciplinaNome} · {ref.arquivo} · {rotuloStatus}
                {ref.nota ? ` · ${ref.nota}` : ""}
              </span>
            </div>
            {podeRemover && (
              <button
                type="button"
                aria-label={`Remover referência ao apontamento ${ref.numero}`}
                className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/ref:opacity-100"
                onClick={() => desligar(ref.id)}
                disabled={pending}
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        );
      })}

      {aberto ? (
        <div className="space-y-1">
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar apontamento (nº ou texto)…"
            className="w-full rounded-sm border bg-background px-1.5 py-1 text-[11px] outline-none focus:border-primary"
            autoFocus
          />
          <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-sm border bg-muted/30 p-1">
            {buscando ? (
              <span className="flex items-center gap-1 px-1 py-1 text-[11px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> buscando…
              </span>
            ) : alvos.length === 0 ? (
              <span className="block px-1 py-1 text-[11px] text-muted-foreground">
                Nenhum apontamento encontrado neste projeto.
              </span>
            ) : (
              alvos.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="block w-full rounded-sm px-1 py-0.5 text-left text-[11px] hover:bg-accent disabled:opacity-50"
                  onClick={() => ligar(a)}
                  disabled={pending}
                >
                  <span className="font-medium">#{a.numero}</span>{" "}
                  <span className="text-muted-foreground">{a.disciplinaNome}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{a.texto}</span>
                </button>
              ))
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => {
              setAberto(false);
              setTermo("");
            }}
            disabled={pending}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
          onClick={() => setAberto(true)}
          disabled={pending}
        >
          <Link2 className="size-3" /> referenciar
        </Button>
      )}
    </div>
  );
}
