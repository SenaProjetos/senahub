"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageSquarePlus, Send } from "lucide-react";
import { registrarHumor, registrarHumorFeedback } from "@/modules/rh/actions";

const FACES = [
  { v: 1, emoji: "😣", label: "Péssimo" },
  { v: 2, emoji: "🙁", label: "Ruim" },
  { v: 3, emoji: "😐", label: "Neutro" },
  { v: 4, emoji: "🙂", label: "Bom" },
  { v: 5, emoji: "😄", label: "Ótimo" },
];

/**
 * Seletor de humor diário no herocard (Mód 1/9) + comentário opcional à RH com
 * toggle de anonimato. Humor → RegistroEmocao (do dia); comentário → FeedbackHumor.
 */
export function HeroHumor({ humorAtual, light }: { humorAtual: number | null; light: boolean }) {
  const [sel, setSel] = useState<number | null>(humorAtual);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [anon, setAnon] = useState(false);
  const [pending, start] = useTransition();

  const caixa = light
    ? "text-neutral-800 border-neutral-300/70 bg-black/5"
    : "text-slate-200 border-white/20 bg-white/10";

  function escolher(v: number) {
    setSel(v);
    start(async () => {
      const r = await registrarHumor({ humor: v });
      if (r.ok) toast.success("Humor registrado. Obrigado!");
      else toast.error(r.error);
    });
  }

  function enviarFeedback() {
    const conteudo = texto.trim();
    if (!conteudo) return;
    start(async () => {
      const r = await registrarHumorFeedback({ conteudo, anonimo: anon });
      if (r.ok) {
        toast.success(anon ? "Feedback anônimo enviado à RH." : "Feedback enviado à RH.");
        setTexto("");
        setAberto(false);
      } else toast.error(r.error);
    });
  }

  return (
    <div className={`mt-3 max-w-md rounded-lg border px-3 py-2 backdrop-blur-sm ${caixa}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-80">Como você está hoje?</span>
        <div className="flex gap-0.5">
          {FACES.map((f) => (
            <button
              key={f.v}
              type="button"
              aria-label={f.label}
              aria-pressed={sel === f.v}
              title={f.label}
              disabled={pending}
              onClick={() => escolher(f.v)}
              className={`rounded-md px-1 text-lg leading-none transition-transform hover:scale-110 ${
                sel === f.v ? "scale-110 opacity-100" : "opacity-55"
              }`}
            >
              {f.emoji}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAberto((o) => !o)}
          className="ml-auto inline-flex items-center gap-1 text-[11px] underline-offset-2 hover:underline"
        >
          <MessageSquarePlus className="size-3.5" /> Comentar
        </button>
      </div>

      {aberto && (
        <div className="mt-2 space-y-2">
          <textarea
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Quer comentar algo à empresa? (opcional)"
            className="w-full resize-y rounded-sm border bg-background/80 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px]">
              <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="accent-primary" />
              Enviar como anônimo
            </label>
            <button
              type="button"
              onClick={enviarFeedback}
              disabled={pending || !texto.trim()}
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              <Send className="size-3" /> Enviar à RH
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
