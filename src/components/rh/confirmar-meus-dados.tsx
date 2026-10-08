"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { confirmarMeusDados } from "@/modules/rh/cadastro/pedido-actions";
import { Button } from "@/components/ui/button";

type Dados = {
  telefone: string | null;
  emailPessoal: string | null;
  enderecoLogradouro: string | null;
  enderecoNumero: string | null;
  enderecoComplemento: string | null;
  enderecoBairro: string | null;
  enderecoCidade: string | null;
  enderecoUf: string | null;
  enderecoCep: string | null;
  contatoEmergenciaNome: string | null;
  telefoneEmergencia: string | null;
};

const ou = (v: string | null | undefined) => (v && v.trim() ? v : "—");

/**
 * Reconfirmação anual (Minha conta): mostra o que está no cadastro e pede "Está tudo certo". Se algo
 * mudou, a pessoa corrige em "Editar meus dados" (fluxo com validação do RH) e depois confirma.
 */
export function ConfirmarMeusDados({ dados, destacar }: { dados: Dados; destacar: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const endereco = [dados.enderecoLogradouro, dados.enderecoNumero, dados.enderecoComplemento, dados.enderecoBairro, dados.enderecoCidade && `${dados.enderecoCidade}/${dados.enderecoUf ?? ""}`, dados.enderecoCep]
    .filter((x) => x && String(x).trim())
    .join(", ");
  return (
    <div className={`space-y-2 rounded-sm border px-4 py-3 ${destacar ? "border-warning bg-warning/5" : "border-warning/40 bg-warning/5"}`}>
      <p className="text-sm font-medium">Confira se seus dados continuam certos</p>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-muted-foreground">Telefone: </dt><dd className="inline">{ou(dados.telefone)}</dd></div>
        <div><dt className="inline text-muted-foreground">E-mail pessoal: </dt><dd className="inline">{ou(dados.emailPessoal)}</dd></div>
        <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Endereço: </dt><dd className="inline">{ou(endereco)}</dd></div>
        <div className="sm:col-span-2">
          <dt className="inline text-muted-foreground">Emergência: </dt>
          <dd className="inline">{ou([dados.contatoEmergenciaNome, dados.telefoneEmergencia].filter(Boolean).join(" · "))}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending} onClick={() => start(async () => {
          const r = await confirmarMeusDados({});
          if (r.ok) {
            toast.success("Obrigado! Dados confirmados.");
            router.replace("/minha-ficha");
            router.refresh();
          } else toast.error(r.error);
        })}>
          <CheckCheck className="size-3.5" /> Está tudo certo
        </Button>
        <span className="text-xs text-muted-foreground">Algo mudou? Use Editar meus dados logo abaixo e depois confirme.</span>
      </div>
    </div>
  );
}
