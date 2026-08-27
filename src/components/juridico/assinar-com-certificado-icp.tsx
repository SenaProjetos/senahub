"use client";

import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Assinatura com certificado digital ICP-Brasil (A1/A3) — **ainda não implementada** (Fase J do
 * spec `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`).
 *
 * O botão fica VISÍVEL de propósito, a pedido do dono: quem tem certificado precisa saber que o
 * caminho está previsto, em vez de concluir que o sistema não suporta e procurar outra ferramenta.
 * Mas ele **recusa em voz alta** — nunca finge ter assinado. Um botão que simulasse sucesso aqui
 * produziria a pior falha possível neste módulo: alguém acreditar que assinou com validade
 * qualificada quando não assinou nada.
 *
 * A assinatura interna/externa que JÁ funciona (MP 2.200-2/2001 art. 10, §2º) continua sendo o
 * caminho válido para contrato entre particulares — que é a totalidade do uso previsto aqui.
 */
export function AssinarComCertificadoIcp() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() =>
        toast.info("Ferramenta em desenvolvimento.", {
          description:
            "A assinatura com certificado ICP-Brasil ainda não está disponível. Use a assinatura eletrônica acima — ela tem validade jurídica entre as partes (MP 2.200-2/2001).",
          duration: 8000,
        })
      }
    >
      <BadgeCheck className="size-3.5" /> Assinar com certificado digital
    </Button>
  );
}
