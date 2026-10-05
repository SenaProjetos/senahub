"use client";

import { BriefingForm } from "@/components/inputs/briefing-form";
import { filtrarSecoes } from "@/modules/inputs/briefing-schema";

/** Briefing de Start no link público: salva via rota token-gated (sem login). */
export function BriefingPublico({
  token,
  respostasIniciais,
  disciplinas,
}: {
  token: string;
  respostasIniciais: Record<string, unknown>;
  disciplinas: string[];
}) {
  const secoes = filtrarSecoes(disciplinas);

  async function onSalvar(respostas: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/p/inputs/${token}/briefing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas }),
      });
      if (res.ok) return { ok: true as const };
      // 400 de formato traz a mensagem e o campo (`campos`); qualquer outra recusa segue genérica.
      const j = res.status === 400 ? await res.json().catch(() => null) : null;
      return {
        ok: false as const,
        error: typeof j?.error === "string" ? j.error : "Não foi possível salvar.",
        campos: (j?.campos ?? undefined) as Record<string, string> | undefined,
      };
    } catch {
      return { ok: false as const, error: "Falha de conexão." };
    }
  }

  return (
    <section className="rounded-sm border bg-card p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">Briefing de Start</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Preencha as informações técnicas para iniciarmos os projetos. Salvo automaticamente.
      </p>
      <BriefingForm respostasIniciais={respostasIniciais} secoes={secoes} onSalvar={onSalvar} />
    </section>
  );
}
