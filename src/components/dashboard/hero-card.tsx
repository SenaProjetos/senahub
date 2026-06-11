import { Quote } from "lucide-react";
import { fraseDoDia } from "@/lib/frase-do-dia";

function saudacao(h = new Date().getHours()): string {
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function HeroCard({ nome }: { nome: string }) {
  const frase = fraseDoDia();
  const primeiro = nome.split(" ")[0];

  return (
    <section className="relative overflow-hidden rounded-sm border bg-card p-6">
      <div className="relative z-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {saudacao()}
        </p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{primeiro}</h2>

        <figure className="mt-5 flex max-w-2xl items-start gap-3">
          <Quote className="mt-0.5 size-5 shrink-0 text-primary/60" />
          <div>
            <blockquote className="text-sm leading-relaxed text-foreground/90">
              {frase.frase}
            </blockquote>
            <figcaption className="mt-1 text-xs text-muted-foreground">— {frase.autor}</figcaption>
          </div>
        </figure>
      </div>
    </section>
  );
}
