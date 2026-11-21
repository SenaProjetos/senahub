"use client";

import { BriefingForm } from "@/components/inputs/briefing-form";
import type { SecaoBriefing } from "@/modules/inputs/briefing-schema";

/** Briefing de Start no link público: salva via rota token-gated (sem login). */
export function BriefingPublico({
  token,
  respostasIniciais,
  secoes,
  somenteLeitura = false,
}: {
  token: string;
  respostasIniciais: Record<string, unknown>;
  /** Só as seções que o cliente deve ver (modelo, disciplinas e ocultos já aplicados NO SERVIDOR). */
  secoes: SecaoBriefing[];
  /** Encerrado pela equipe: mostra as respostas, sem editar. */
  somenteLeitura?: boolean;
}) {
  async function onSalvar(respostas: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/p/inputs/${token}/briefing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas }),
      });
      if (res.ok) {
        const j = await res.json().catch(() => null);
        return { ok: true as const, descartados: Array.isArray(j?.descartados) ? (j.descartados as string[]) : [] };
      }
      // 400 de formato traz a mensagem e o campo (`campos`); 409 (encerrado) traz a frase pronta; o resto segue genérico.
      const j = res.status === 400 || res.status === 409 ? await res.json().catch(() => null) : null;
      return {
        ok: false as const,
        error: typeof j?.error === "string" ? j.error : "Não foi possível salvar.",
        campos: (j?.campos ?? undefined) as Record<string, string> | undefined,
      };
    } catch {
      return { ok: false as const, error: "Falha de conexão." };
    }
  }

  // Tudo oculto pela equipe neste projeto: o link mostra só as perguntas extras.
  if (secoes.length === 0) return null;

  return (
    <section className="rounded-sm border bg-card p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">Briefing de Start</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        {somenteLeitura
          ? "Respostas enviadas. O preenchimento foi encerrado pela equipe."
          : "Preencha as informações técnicas para iniciarmos os projetos. Salvo automaticamente."}
      </p>
      <BriefingForm respostasIniciais={respostasIniciais} secoes={secoes} onSalvar={onSalvar} canEdit={!somenteLeitura} />
    </section>
  );
}
