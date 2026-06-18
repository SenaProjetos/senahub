"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { salvarConfigFinanceiro, salvarAliquotas } from "@/modules/financeiro/config/actions";
import type { ConfigFinanceiro } from "@/modules/financeiro/config/queries";
import type { CamposObrigatorios } from "@/modules/financeiro/config/validacao";
import type { Aliquotas } from "@/modules/financeiro/fechamento/calculo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CAMPOS: { key: keyof CamposObrigatorios; label: string; desc: string }[] = [
  { key: "contato", label: "Contato", desc: "Exigir fornecedor (despesa) ou cliente (receita)." },
  { key: "centro", label: "Centro de custo", desc: "Exigir centro de custo no lançamento." },
  { key: "projeto", label: "Projeto", desc: "Exigir vínculo com um projeto." },
  { key: "forma", label: "Forma de pagamento", desc: "Exigir forma de pagamento." },
  { key: "observacao", label: "Observação", desc: "Exigir o campo de observação." },
];

export function ConfiguracoesView({ config, aliquotas }: { config: ConfigFinanceiro; aliquotas: Aliquotas }) {
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

      <AliquotasCard inicial={aliquotas} />
    </div>
  );
}

const CAMPOS_ALIQUOTA: { key: keyof Aliquotas; label: string }[] = [
  { key: "iss", label: "ISS" },
  { key: "inss", label: "INSS" },
  { key: "ir", label: "IR" },
  { key: "desconto", label: "Desconto" },
];

function AliquotasCard({ inicial }: { inicial: Aliquotas }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aliq, setAliq] = useState<Aliquotas>(inicial);

  function set(k: keyof Aliquotas, v: string) {
    setAliq((p) => ({ ...p, [k]: Math.max(0, Math.min(100, Number(v) || 0)) }));
  }
  function salvar() {
    start(async () => {
      const r = await salvarAliquotas(aliq);
      if (r.ok) {
        toast.success("Alíquotas salvas.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alíquotas do fechamento mensal (%)</CardTitle>
        <CardDescription>Retenções e desconto aplicados automaticamente sobre a folha bruta no fechamento.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CAMPOS_ALIQUOTA.map((c) => (
            <div key={c.key} className="space-y-1.5">
              <Label className="text-xs">{c.label}</Label>
              <Input type="number" step="0.01" min={0} max={100} value={aliq[c.key]} onChange={(e) => set(c.key, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={salvar} disabled={pending}>{pending ? "Salvando…" : "Salvar alíquotas"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
