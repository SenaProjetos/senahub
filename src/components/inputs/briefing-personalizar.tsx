"use client";

import { useState } from "react";
import { toast } from "sonner";
import { definirVisibilidadeBriefing } from "@/modules/inputs/actions";
import type { OcultosBriefing, SecaoBriefing } from "@/modules/inputs/briefing-schema";
import { cn } from "@/lib/utils";
import { useGravacaoPorItem } from "@/lib/use-gravacao-por-item";
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
  // Cada chave grava sozinha e só ela fica ocupada: dá para desmarcar várias seguidas sem esperar o servidor.
  const g = useGravacaoPorItem();
  const [ocultos, setOcultos] = useState(ocultosIniciais);

  /** Liga/desliga UMA chave sobre o estado atual (não sobre o da hora do clique): outras gravações seguem em curso. */
  const aplicar = (alvo: "secao" | "campo", chave: string, oculto: boolean) =>
    setOcultos((o) => {
      const lista = (alvo === "secao" ? o.secoes : o.campos).filter((c) => c !== chave);
      const nova = oculto ? [...lista, chave] : lista;
      return alvo === "secao" ? { ...o, secoes: nova } : { ...o, campos: nova };
    });

  function alternar(alvo: "secao" | "campo", chave: string, oculto: boolean) {
    aplicar(alvo, chave, oculto);
    g.rodar(`${alvo}:${chave}`, async () => {
      const r = await definirVisibilidadeBriefing({ projetoId, alvo, chave, oculto });
      if (!r.ok) {
        // Desfaz só esta chave: as outras marcações em curso ficam.
        aplicar(alvo, chave, !oculto);
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
                  disabled={g.salvando(`secao:${secao.id}`)}
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
                        disabled={g.salvando(`campo:${campo.chave}`) || secaoOculta}
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
