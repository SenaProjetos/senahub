"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { salvarConfigComercial } from "@/modules/comercial/actions";
import type { ConfigComercial } from "@/modules/comercial/config/padroes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputPercentual } from "@/components/ui/input-percentual";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Tela de configuração do Comercial (F7.2) — os números que hoje governam justificativa de
 * desconto (F5.8), as automações da Fase 7 (`regras.ts`, F7.1) e a Home/Meu Dia (F6.5). Antes
 * desta tela, mudar
 * qualquer um deles exigia editar `CONFIG_COMERCIAL_PADRAO` no código e fazer deploy — o que o
 * F1.7 já tinha resolvido do lado do banco (`ConfigSistema`), mas sem UI ninguém conseguia usar.
 */
const CAMPOS: {
  key: keyof ConfigComercial;
  label: string;
  desc: string;
  sufixo: string;
}[] = [
  {
    key: "descontoMaxSemJustificativa",
    label: "Desconto sem justificativa",
    desc: "Acima deste percentual, salvar a proposta passa a exigir justificativa registrada (F5.8).",
    sufixo: "%",
  },
  {
    key: "diasSemContato",
    label: "Dias sem contato",
    desc: "Negociação viva sem nenhuma interação registrada por este período vira alerta.",
    sufixo: "dias",
  },
  {
    key: "diasAvisoValidadeProposta",
    label: "Antecedência do aviso de validade",
    desc: "Quantos dias antes do vencimento a proposta enviada avisa que está perto de vencer.",
    sufixo: "dias",
  },
  {
    key: "diasClienteInativo",
    label: "Cliente inativo",
    desc: "Dias sem nova contratação para o cliente ser sinalizado como inativo.",
    sufixo: "dias",
  },
  {
    key: "diasParadoNoEstagio",
    label: "Negociação parada no estágio",
    desc: "Dias sem mudar de estágio (mesmo com contato em dia) para virar alerta de progresso.",
    sufixo: "dias",
  },
  {
    key: "diasParaReativar",
    label: "Sugestão de reativação",
    desc: "Cliente recorrente parado por este período vira sugestão de reativação (telefonema).",
    sufixo: "dias",
  },
  {
    key: "diasHorizonteProximasAcoes",
    label: "Horizonte de 'Próximas ações'",
    desc: "Quantos dias à frente a Home do Comercial lista como próximas ações agendadas.",
    sufixo: "dias",
  },
];

export function ConfiguracoesComercialView({ config }: { config: ConfigComercial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [valores, setValores] = useState<ConfigComercial>(config);

  function alterar(key: keyof ConfigComercial, valor: number | null) {
    setValores((v) => ({ ...v, [key]: valor ?? 0 }));
  }

  function salvar() {
    start(async () => {
      const r = await salvarConfigComercial(valores);
      if (r.ok) {
        toast.success("Configurações salvas.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/comercial" aria-label="Voltar" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Configurações do Comercial</h2>
          <p className="text-sm text-muted-foreground">
            Limiares usados por desconto, alertas e automações — nada aqui fica cravado no código.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limiares (em dias, salvo indicado)</CardTitle>
          <CardDescription>Mudar um valor aqui muda o próximo tick das automações (F7.3), sem deploy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {CAMPOS.map((c) => (
            <div key={c.key} className="space-y-1.5">
              <Label htmlFor={c.key}>{c.label}</Label>
              <div className="flex items-center gap-2">
                {c.sufixo === "%" ? (
                  <InputPercentual
                    id={c.key}
                    decimais={1}
                    className="w-32"
                    value={valores[c.key]}
                    onChange={(v) => alterar(c.key, v)}
                  />
                ) : (
                  <Input
                    id={c.key}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    className="w-32 text-right tabular-nums"
                    value={valores[c.key]}
                    onChange={(e) => alterar(c.key, Number(e.target.value))}
                  />
                )}
                {c.sufixo !== "%" && <span className="text-sm text-muted-foreground">{c.sufixo}</span>}
              </div>
              <p className="text-xs text-muted-foreground">{c.desc}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={pending}>
          <Save className="size-4" /> {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
