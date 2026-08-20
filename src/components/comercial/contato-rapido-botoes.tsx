"use client";

import { Mail, MessageCircle } from "lucide-react";
import { linkEmail, linkWhatsApp } from "@/modules/comercial/contato-rapido";
import { Button } from "@/components/ui/button";

/**
 * Botões de contato rápido (F2.16) — WhatsApp e e-mail.
 *
 * Cada botão **só existe se houver dado utilizável**: sem telefone válido não há botão de
 * WhatsApp, sem e-mail não há botão de e-mail. É o aceite da tarefa, e evita o pior resultado
 * possível — um botão que abre o app numa conversa que não existe.
 *
 * `target="_blank"` + `rel="noopener noreferrer"` no WhatsApp porque é navegação externa;
 * `mailto:` abre no cliente local e não precisa de aba nova.
 *
 * ⚠️ Só ABRE a conversa. Nada é enviado nem lido pelo sistema — veredito do dono (#28): sem API
 * de WhatsApp. O registro da interação é manual, e é da F3.4.
 */
export function ContatoRapidoBotoes({
  telefone,
  email,
  assunto,
  mensagem,
  tamanho = "sm",
}: {
  telefone?: string | null;
  email?: string | null;
  /** Assunto do e-mail — normalmente o título da negociação/prospecção. */
  assunto?: string;
  /** Texto inicial do WhatsApp. */
  mensagem?: string;
  tamanho?: "sm" | "icon";
}) {
  const wpp = linkWhatsApp(telefone, mensagem);
  const mail = linkEmail(email, assunto);
  if (!wpp && !mail) return null;

  return (
    <div className="flex items-center gap-1">
      {wpp && (
        <Button
          variant="outline"
          size={tamanho}
          render={
            <a href={wpp} target="_blank" rel="noopener noreferrer" aria-label="Abrir no WhatsApp" />
          }
        >
          <MessageCircle className="size-3.5" />
          {tamanho === "sm" && "WhatsApp"}
        </Button>
      )}
      {mail && (
        <Button
          variant="outline"
          size={tamanho}
          render={<a href={mail} aria-label="Enviar e-mail" />}
        >
          <Mail className="size-3.5" />
          {tamanho === "sm" && "E-mail"}
        </Button>
      )}
    </div>
  );
}
