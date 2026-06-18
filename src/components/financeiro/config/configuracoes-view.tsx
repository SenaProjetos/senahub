"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { salvarConfigFinanceiro } from "@/modules/financeiro/config/actions";
import type { ConfigFinanceiro } from "@/modules/financeiro/config/queries";
import type { CamposObrigatorios } from "@/modules/financeiro/config/validacao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CAMPOS: { key: keyof CamposObrigatorios; label: string; desc: string }[] = [
  { key: "contato", label: "Contato", desc: "Exigir fornecedor (despesa) ou cliente (receita)." },
  { key: "centro", label: "Centro de custo", desc: "Exigir centro de custo no lançamento." },
  { key: "projeto", label: "Projeto", desc: "Exigir vínculo com um projeto." },
  { key: "forma", label: "Forma de pagamento", desc: "Exigir forma de pagamento." },
  { key: "observacao", label: "Observação", desc: "Exigir o campo de observação." },
];

export function ConfiguracoesView({ config }: { config: ConfigFinanceiro }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [obrig, setObrig] = useState<CamposObrigatorios>(config.obrigatorios);

  function toggle(k: keyof CamposObrigatorios) {
    setObrig((p) => ({ ...p, [k]: !p[k] }));
  }
  function salvar() {
    start(async () => {
      const r = await salvarConfigFinanceiro({ obrigatorios: obrig });
      if (r.ok) {
        toast.success("Configurações salvas.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Configurações financeiras</h2>
        <p className="text-sm text-muted-foreground">Regras do módulo financeiro.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campos obrigatórios no lançamento</CardTitle>
          <CardDescription>Marque os campos que passam a ser exigidos ao criar um lançamento.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {CAMPOS.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-start gap-3 rounded-sm px-2 py-2 hover:bg-muted/40">
              <input
                type="checkbox"
                checked={obrig[c.key]}
                onChange={() => toggle(c.key)}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="block text-sm font-medium">{c.label}</span>
                <span className="block text-xs text-muted-foreground">{c.desc}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={pending}>{pending ? "Salvando…" : "Salvar configurações"}</Button>
      </div>
    </div>
  );
}
