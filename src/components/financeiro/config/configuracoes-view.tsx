"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { salvarConfigFinanceiro, salvarAliquotas, salvarSenhaExclusao } from "@/modules/financeiro/config/actions";
import { salvarNiveisAprovacao } from "@/modules/financeiro/aprovacao/actions";
import type { ConfigFinanceiro } from "@/modules/financeiro/config/queries";
import type { CamposObrigatorios } from "@/modules/financeiro/config/validacao";
import type { Aliquotas } from "@/modules/financeiro/fechamento/calculo";
import { PAPEIS_APROVADORES, type FaixaAlcada } from "@/modules/financeiro/aprovacao/niveis";
import { ROLE_LABELS, type Role } from "@/lib/roles";
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

export function ConfiguracoesView({
  config,
  aliquotas,
  niveis,
  exclusao,
}: {
  config: ConfigFinanceiro;
  aliquotas: Aliquotas;
  niveis: FaixaAlcada[];
  exclusao: { exigir: boolean };
}) {
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
      <NiveisAlcadaCard inicial={niveis} />
      <SenhaExclusaoCard inicial={exclusao} />
    </div>
  );
}

function SenhaExclusaoCard({ inicial }: { inicial: { exigir: boolean } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [exigir, setExigir] = useState(inicial.exigir);
  const [senha, setSenha] = useState("");

  function salvar() {
    start(async () => {
      const r = await salvarSenhaExclusao({ exigir, senha: senha || "" });
      if (r.ok) {
        toast.success("Configuração de exclusão salva.");
        setSenha("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Senha para exclusão</CardTitle>
        <CardDescription>Proteção contra exclusão acidental de lançamentos. Não é a senha de login.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={exigir} onChange={(e) => setExigir(e.target.checked)} className="size-4" />
          Exigir senha ao excluir lançamentos
        </label>
        <div className="space-y-1.5">
          <Label className="text-xs">{inicial.exigir ? "Trocar senha (deixe vazio para manter)" : "Definir senha"}</Label>
          <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="w-60" autoComplete="new-password" />
        </div>
        <div className="flex justify-end">
          <Button onClick={salvar} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NiveisAlcadaCard({ inicial }: { inicial: FaixaAlcada[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [faixas, setFaixas] = useState<FaixaAlcada[]>(inicial.length > 0 ? inicial : [{ ate: null, papeis: [] }]);

  function setAte(i: number, v: string) {
    setFaixas((p) => p.map((f, idx) => (idx === i ? { ...f, ate: v === "" ? null : Math.max(0, Number(v) || 0) } : f)));
  }
  function togglePapel(i: number, papel: string) {
    setFaixas((p) =>
      p.map((f, idx) =>
        idx === i ? { ...f, papeis: f.papeis.includes(papel) ? f.papeis.filter((x) => x !== papel) : [...f.papeis, papel] } : f,
      ),
    );
  }
  function adicionar() {
    setFaixas((p) => [...p, { ate: null, papeis: [] }]);
  }
  function remover(i: number) {
    setFaixas((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
  }
  function salvar() {
    start(async () => {
      const r = await salvarNiveisAprovacao({ niveis: faixas });
      if (r.ok) {
        toast.success("Níveis de alçada salvos.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Níveis de alçada (aprovação de despesas)</CardTitle>
        <CardDescription>
          Por faixa de valor: defina quem aprova. Faixa sem papéis = aprovação automática. Deixe “até” vazio para “sem teto”.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {faixas.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 rounded-sm border px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">até R$</Label>
              <Input
                type="number"
                min={0}
                value={f.ate ?? ""}
                onChange={(e) => setAte(i, e.target.value)}
                placeholder="sem teto"
                className="h-8 w-28"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {PAPEIS_APROVADORES.map((papel) => (
                <label key={papel} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={f.papeis.includes(papel)} onChange={() => togglePapel(i, papel)} className="size-3.5" />
                  {ROLE_LABELS[papel as Role]}
                </label>
              ))}
            </div>
            <span className="ml-auto text-xs text-muted-foreground">
              {f.papeis.length === 0 ? "automático" : "exige aprovação"}
            </span>
            <Button variant="ghost" size="icon" aria-label="Remover faixa" onClick={() => remover(i)} disabled={faixas.length <= 1}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={adicionar}><Plus className="size-4" /> Adicionar faixa</Button>
          <Button onClick={salvar} disabled={pending}>{pending ? "Salvando…" : "Salvar níveis"}</Button>
        </div>
      </CardContent>
    </Card>
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
