"use client";

import { PerguntasExtrasForm, type ItemExtra, type SalvarExtra } from "@/components/inputs/perguntas-extras-form";

/** Perguntas extras no link público: salva pela rota token-gated (sem login). */
export function InputsPublicForm({
  token,
  itens,
  somenteLeitura = false,
}: {
  token: string;
  itens: ItemExtra[];
  somenteLeitura?: boolean;
}) {
  const salvar: SalvarExtra = async (id, resposta) => {
    try {
      const res = await fetch(`/api/p/inputs/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas: [{ id, resposta }] }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        // Uma resposta por requisição: o que não foi salvo é pergunta removida pela equipe.
        const salvos = typeof j?.salvos === "number" ? j.salvos : 1;
        return { ok: true as const, ignoradas: salvos >= 1 ? 0 : 1 };
      }
      // 409 (encerrado) e 400 trazem a frase pronta no corpo.
      const erro =
        (res.status === 409 || res.status === 400) && typeof j?.error === "string"
          ? j.error
          : "Não foi possível salvar.";
      return { ok: false as const, erro };
    } catch {
      return { ok: false as const, erro: "Falha de conexão." };
    }
  };

  return <PerguntasExtrasForm itens={itens} salvar={salvar} somenteLeitura={somenteLeitura} />;
}
