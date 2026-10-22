"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { definirVisibilidadeBriefing } from "@/modules/inputs/actions";
import type { OcultosBriefing, SecaoBriefing } from "@/modules/inputs/briefing-schema";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

/**
 * Modo "Personalizar" do briefing: escolhe o que aparece NESTE projeto. Marcado = aparece na tela
 * e no link do cliente. Ocultar não apaga resposta — mostrar de novo traz o que já estava preenchido.
 */
export function BriefingPersonalizar({
  projetoId,
  secoes,
  ocultos: ocultosIniciais,
}: {
  projetoId: string;
  /** Seções das disciplinas do projeto, SEM aplicar os ocultos. */
  secoes: SecaoBriefing[];
  ocultos: OcultosBriefing;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ocultos, setOcultos] = useState(ocultosIniciais);

  function alternar(alvo: "secao" | "campo", chave: string, oculto: boolean) {
    const anterior = ocultos;
    const lista = alvo === "secao" ? ocultos.secoes : ocultos.campos;
    const nova = oculto ? [...lista, chave] : lista.filter((c) => c !== chave);
    setOcultos(alvo === "secao" ? { ...ocultos, secoes: nova } : { ...ocultos, campos: nova });
    start(async () => {
      const r = await definirVisibilidadeBriefing({ projetoId, alvo, chave, oculto });
      if (r.ok) router.refresh();
      else {
        setOcultos(anterior);
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Desmarque o que não se aplica a este projeto. O que fica oculto some da tela e do link do cliente e
        não conta no status; as respostas ficam guardadas.
      </p>
      {secoes.map((secao) => {
        const secaoOculta = ocultos.secoes.includes(secao.id);
        return (
          <section key={secao.id} className="rounded-sm border">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
              <span className={cn("text-sm font-medium", secaoOculta && "text-muted-foreground line-through")}>
                {secao.titulo}
              </span>
              <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {secaoOculta ? "Seção oculta" : "Seção visível"}
                <Switch
                  checked={!secaoOculta}
                  disabled={pending}
                  aria-label={`Mostrar a seção ${secao.titulo}`}
                  onCheckedChange={(v: boolean) => alternar("secao", secao.id, !v)}
                />
              </label>
            </div>
            <ul className="divide-y">
              {secao.campos.map((campo) => {
                const campoOculto = ocultos.campos.includes(campo.chave);
                return (
                  <li key={campo.chave}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm",
                        (secaoOculta || campoOculto) && "text-muted-foreground",
                        secaoOculta && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={!campoOculto}
                        disabled={pending || secaoOculta}
                        onCheckedChange={(v: boolean) => alternar("campo", campo.chave, !v)}
                      />
                      <span className="min-w-0">
                        {campo.label}
                        {campo.obrigatorio && <span className="ml-1.5 text-xs text-muted-foreground">(obrigatório)</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
