"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { registrarInteracao, obterTemplatosNotas } from "@/modules/comercial/actions";
import { ATIVIDADE_ICONE } from "@/components/comercial/atividade-icones";
import type { TipoAncoraCompromisso } from "@/modules/comercial/labels";
import type { TipoAtividade } from "@/generated/prisma/client";
import type { TemplateNota } from "@/modules/comercial/templates-notas";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type TipoRegistravel = Extract<
  TipoAtividade,
  "LIGACAO" | "WHATSAPP" | "EMAIL" | "LINKEDIN" | "REUNIAO" | "NOTA"
>;
type TipoRapido = Exclude<TipoRegistravel, "NOTA">;

/**
 * F3.4 — 1 clique para abrir + 1 clique no tipo = interação registrada na timeline.
 *
 * Os 5 tipos "rápidos" (ligação/whatsapp/e-mail/linkedin/reunião) já têm uma descrição padrão —
 * clicar no ícone registra na hora, sem digitar nada. `NOTA` é o único que não tem "o que
 * aconteceu" óbvio, então abre um campo de texto em vez de disparar sozinho.
 *
 * Ícones vêm de `ATIVIDADE_ICONE` (F3.6) — o mesmo conjunto que o `<Timeline>` usa pra exibir,
 * pra "ligar" na popover parecer com "ligação" na timeline depois.
 */
const IconeNota = ATIVIDADE_ICONE.NOTA;

const TIPOS_RAPIDOS: { tipo: TipoRapido; label: string; nota: string }[] = [
  { tipo: "LIGACAO", label: "Ligação", nota: "Ligação realizada." },
  { tipo: "WHATSAPP", label: "WhatsApp", nota: "Mensagem enviada por WhatsApp." },
  { tipo: "EMAIL", label: "E-mail", nota: "E-mail enviado." },
  { tipo: "LINKEDIN", label: "LinkedIn", nota: "Contato via LinkedIn." },
  { tipo: "REUNIAO", label: "Reunião", nota: "Reunião realizada." },
];

export function RegistrarInteracaoPopover({
  entidadeTipo,
  entidadeId,
  className,
  label,
}: {
  entidadeTipo: TipoAncoraCompromisso;
  entidadeId: string;
  className?: string;
  /** Se dado, o gatilho vira um `Button` normal (com texto) em vez do ícone compacto do card. */
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [notaAberta, setNotaAberta] = useState(false);
  const [notaTexto, setNotaTexto] = useState("");
  const [templates, setTemplates] = useState<TemplateNota[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useEffect(() => {
    if (notaAberta && templates.length === 0 && !loadingTemplates) {
      setLoadingTemplates(true);
      obterTemplatosNotas()
        .then(setTemplates)
        .catch(() => setTemplates([]))
        .finally(() => setLoadingTemplates(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notaAberta]);

  function registrar(tipo: TipoRegistravel, nota: string) {
    if (!nota.trim()) return;
    start(async () => {
      const r = await registrarInteracao({ entidadeTipo, entidadeId, tipo, nota: nota.trim() });
      if (r.ok) {
        toast.success("Interação registrada.");
        setOpen(false);
        setNotaAberta(false);
        setNotaTexto("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setNotaAberta(false);
          setNotaTexto("");
        }
      }}
    >
      <PopoverTrigger
        render={
          label ? (
            <Button type="button" size="sm" variant="outline" className={className}>
              <Plus className="size-3.5" /> {label}
            </Button>
          ) : (
            <button
              type="button"
              aria-label="Registrar interação"
              title="Registrar interação"
              className={
                className ??
                "inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              }
              onClick={(e) => e.stopPropagation()}
            >
              <Plus className="size-3.5" />
            </button>
          )
        }
      />
      <PopoverContent
        align="start"
        className="w-64 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        {!notaAberta ? (
          <div className="space-y-1">
            <p className="px-1 pb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              O que aconteceu?
            </p>
            <div className="grid grid-cols-1 gap-0.5">
              {TIPOS_RAPIDOS.map(({ tipo, label, nota }) => {
                const Icone = ATIVIDADE_ICONE[tipo];
                return (
                  <Button
                    key={tipo}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-start gap-2"
                    disabled={pending}
                    onClick={() => registrar(tipo, nota)}
                  >
                    <Icone className="size-3.5" /> {label}
                  </Button>
                );
              })}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start gap-2"
                disabled={pending}
                onClick={() => setNotaAberta(true)}
              >
                <IconeNota className="size-3.5" /> Nota
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="px-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              Nota
            </p>
            {templates.length > 0 && (
              <div className="grid grid-cols-1 gap-1 border-b pb-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="rounded-sm border border-dashed px-2 py-1 text-left text-[10px] transition-colors hover:bg-muted"
                    onClick={() => setNotaTexto(t.texto)}
                    disabled={pending}
                  >
                    {t.titulo}
                  </button>
                ))}
              </div>
            )}
            <textarea
              autoFocus
              rows={3}
              placeholder="O que aconteceu…"
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={notaTexto}
              onChange={(e) => setNotaTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) registrar("NOTA", notaTexto);
              }}
            />
            <div className="flex justify-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNotaAberta(false)}
                disabled={pending}
              >
                Voltar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => registrar("NOTA", notaTexto)}
                disabled={pending || !notaTexto.trim()}
              >
                {pending ? "Registrando…" : "Registrar"}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
