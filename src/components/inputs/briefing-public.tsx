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
      return res.ok ? { ok: true as const } : { ok: false as const, error: "Não foi possível salvar." };
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
