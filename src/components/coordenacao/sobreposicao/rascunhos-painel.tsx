"use client";

import { Loader2, Send } from "lucide-react";
import { enviarApontamentos } from "@/modules/projetos/pendencias/actions";
import { Button } from "@/components/ui/button";
import { useLote } from "@/components/ui/use-lote";

type Grupo = { uploadId: string; disciplina: string; titulo: string; numeros: number[] };

/**
 * Meus apontamentos em rascunho nesta sobreposição, por prancha, e "Enviar apontamentos": a MESMA
 * rodada de `enviarApontamentos` de cada prancha (tarefa, aviso, reabertura), uma prancha por vez.
 * Falha numa não desfaz as outras; o relatório diz qual falhou.
 */
export function RascunhosPainel({ grupos }: { grupos: Grupo[] }) {
  const lote = useLote();
  if (grupos.length === 0) return null;
  const total = grupos.reduce((n, g) => n + g.numeros.length, 0);
  const porId = new Map(grupos.map((g) => [g.uploadId, g]));

  return (
    <section
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2"
      aria-label="Apontamentos em rascunho"
    >
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">
          {total === 1 ? "1 apontamento seu em rascunho" : `${total} apontamentos seus em rascunho`}
        </span>
        <span className="text-muted-foreground">
          {" — "}
          {grupos.map((g) => `${g.disciplina} ${g.numeros.map((n) => `#${n}`).join(", ")}`).join(" · ")}
        </span>
      </p>
      <Button
        type="button"
        size="sm"
        disabled={lote.pendente}
        onClick={() =>
          void lote.executar({
            ids: grupos.map((g) => g.uploadId),
            acao: (uploadId) => enviarApontamentos({ uploadId }),
            substantivo: ["prancha", "pranchas"],
            verbo: ["enviada", "enviadas"],
            rotulo: (id) => {
              const g = porId.get(id);
              return g ? `${g.disciplina} · ${g.titulo}` : id;
            },
            confirmar: {
              titulo: (n) => (n === 1 ? "Enviar os apontamentos de 1 prancha?" : `Enviar os apontamentos de ${n} pranchas?`),
              descricao:
                "Cada prancha vira uma tarefa para os responsáveis da disciplina, com aviso. Disciplina já aprovada volta para revisão. Entram também os outros apontamentos abertos e ainda não enviados dessas pranchas.",
              rotuloConfirmar: "Enviar",
            },
          })
        }
      >
        {lote.pendente ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Enviar apontamentos
      </Button>
      {lote.portal}
    </section>
  );
}
