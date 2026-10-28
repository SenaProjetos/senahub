"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/utils";
import { responderPendencia } from "@/modules/projetos/pendencias/actions";
import { MOTIVO_NAO_PARTICIPA, type ProblemaLinha } from "@/modules/projetos/pendencias/problemas";

const LIMITE_TEXTO = 2000;

/**
 * Conversa de um problema: respostas da mais antiga para a mais nova e o campo de resposta.
 * Menções, anexos e ligações ficam no visualizador (o link "Abrir na prancha" leva até lá).
 * `podeResponder` vem da MESMA função que o servidor usa (`podeParticiparDaConversa`).
 */
export function ProblemaConversa({ linha, podeResponder }: { linha: ProblemaLinha; podeResponder: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [texto, setTexto] = useState("");

  const respostas = [...linha.respostas].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const vazio = texto.trim().length === 0;
  const idCampo = `resposta-problema-${linha.id}`;

  function enviar() {
    if (!podeResponder || pending || vazio) return;
    const conteudo = texto.trim();
    start(async () => {
      const r = await responderPendencia({ id: linha.id, texto: conteudo });
      if (r.ok) {
        setTexto("");
        toast.success("Resposta enviada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-2 border-t pt-2">
      {respostas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ainda não há respostas.</p>
      ) : (
        <ul className="space-y-2">
          {respostas.map((r) => (
            <li key={r.id} className="rounded-sm bg-muted/50 px-2 py-1.5">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{r.autor}</span> · {formatarDataHora(r.createdAt)}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{r.texto}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <label htmlFor={idCampo} className="sr-only">
          Resposta ao problema #{linha.numero}
        </label>
        <textarea
          id={idCampo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          maxLength={LIMITE_TEXTO}
          placeholder="Escreva uma resposta"
          disabled={!podeResponder || pending}
          title={podeResponder ? undefined : MOTIVO_NAO_PARTICIPA}
          className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {podeResponder ? (
            <span />
          ) : (
            <p className="min-w-0 text-xs text-muted-foreground">{MOTIVO_NAO_PARTICIPA}</p>
          )}
          <Button
            size="sm"
            onClick={enviar}
            disabled={!podeResponder || pending || vazio}
            title={podeResponder ? undefined : MOTIVO_NAO_PARTICIPA}
          >
            {pending ? "Enviando…" : "Responder"}
          </Button>
        </div>
      </div>
    </div>
  );
}
