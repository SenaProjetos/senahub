"use client";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { salvarConfigFinanceiro, salvarAliquotas, salvarSenhaExclusao } from "@/modules/financeiro/config/actions";
import { salvarNiveisAprovacao } from "@/modules/financeiro/aprovacao/actions";
import { salvarConfigAvisos } from "@/modules/financeiro/avisos/actions";
import type { ConfigAvisos } from "@/modules/financeiro/avisos/regras";
import type { ConfigFinanceiro } from "@/modules/financeiro/config/queries";
import type { CamposObrigatorios } from "@/modules/financeiro/config/validacao";
import type { Aliquotas } from "@/modules/financeiro/fechamento/calculo";
import { PAPEIS_APROVADORES, type FaixaAlcada } from "@/modules/financeiro/aprovacao/niveis";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputPercentual } from "@/components/ui/input-percentual";
import { InputMoeda } from "@/components/ui/input-moeda";
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
  avisos,
  subnav,
}: {
  config: ConfigFinanceiro;
  aliquotas: Aliquotas;
  avisos: ConfigAvisos;
  niveis: FaixaAlcada[];
  exclusao: { exigir: boolean; temSenha: boolean };
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [obrig, setObrig] = useState<CamposObrigatorios>(config.obrigatorios);
  const [comprovante, setComprovante] = useState(config.comprovanteObrigatorioNaBaixa);

  function toggle(k: keyof CamposObrigatorios) {
    setObrig((p) => ({ ...p, [k]: !p[k] }));
  }
  function salvar() {
    start(async () => {
      const r = await salvarConfigFinanceiro({ obrigatorios: obrig, comprovanteObrigatorioNaBaixa: comprovante });
      if (r.ok) {
        toast.success("Configurações salvas.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <CabecalhoPagina titulo="Configurações financeiras" descricao="Regras do módulo financeiro." />
      {subnav}

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comprovante na baixa</CardTitle>
          <CardDescription>Exige ao menos um anexo antes de confirmar/baixar um lançamento lançado à mão.</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-start gap-3 rounded-sm px-2 py-2 hover:bg-muted/40">
            <input
              type="checkbox"
              checked={comprovante}
              onChange={(e) => setComprovante(e.target.checked)}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="block text-sm font-medium">Exigir comprovante para dar baixa</span>
              <span className="block text-xs text-muted-foreground">
                Vale pra baixa manual (uma ou em lote) e Pagamentos em lote. Folha, projetistas, ART, recorrência e
                compras no cartão não precisam — já são aprovados na origem.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={pending}>{pending ? "Salvando…" : "Salvar configurações"}</Button>
      </div>

      <AvisosCard inicial={avisos} />
      <AliquotasCard inicial={aliquotas} />
      <NiveisAlcadaCard inicial={niveis} />
      <SenhaExclusaoCard inicial={exclusao} />
    </div>
  );
}

/**
 * Avisos do financeiro (M9): o que o sistema avisa sozinho. Cobrança ao CLIENTE é e-mail para fora da empresa:
 * antes e no dia vêm desligados até alguém ligar aqui; o D+1 é o que o sistema sempre mandou.
 */
function AvisosCard({ inicial }: { inicial: ConfigAvisos }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cfg, setCfg] = useState<ConfigAvisos>(inicial);

  function salvar() {
    start(async () => {
      const r = await salvarConfigAvisos(cfg);
      if (r.ok) {
        toast.success("Avisos de vencimento salvos.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const Linha = ({ id, ligado, onChange, titulo, desc }: { id: string; ligado: boolean; onChange: (v: boolean) => void; titulo: string; desc: string }) => (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-sm px-2 py-2 hover:bg-muted/40">
      <input id={id} type="checkbox" checked={ligado} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4" />
      <span>
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </label>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Avisos de vencimento</CardTitle>
        <CardDescription>
          O que o sistema avisa sozinho, todo dia às 8h. Cada aviso sai uma vez só por conta e vencimento — se a data mudar, ele vale de novo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="px-2 pt-1 text-xs font-semibold text-muted-foreground">E-mail de cobrança ao cliente (só para quem tem e-mail cadastrado)</p>
        {Linha({ id: "av-antes", ligado: cfg.cobrancaAntes, onChange: (v) => setCfg({ ...cfg, cobrancaAntes: v }), titulo: "Antes do vencimento", desc: "Lembra o cliente alguns dias antes. Desligado até você ligar." })}
        {cfg.cobrancaAntes && (
          <div className="flex items-center gap-2 pl-9 text-sm">
            <Label htmlFor="av-dias" className="text-xs">Quantos dias antes</Label>
            <Input
              id="av-dias"
              type="number"
              min={1}
              max={15}
              value={cfg.diasAntes}
              onChange={(e) => setCfg({ ...cfg, diasAntes: Math.max(1, Math.min(15, Number(e.target.value) || 1)) })}
              className="h-8 w-20"
            />
          </div>
        )}
        {Linha({ id: "av-dia", ligado: cfg.cobrancaNoDia, onChange: (v) => setCfg({ ...cfg, cobrancaNoDia: v }), titulo: "No dia do vencimento", desc: "Desligado até você ligar." })}
        {Linha({ id: "av-apos", ligado: cfg.cobrancaApos, onChange: (v) => setCfg({ ...cfg, cobrancaApos: v }), titulo: "No dia seguinte ao vencimento", desc: "Avisa que o pagamento ainda não foi registrado. É o aviso que o sistema já mandava." })}
        {Linha({ id: "av-licitacao", ligado: cfg.cobrarLicitacao, onChange: (v) => setCfg({ ...cfg, cobrarLicitacao: v }), titulo: "Cobrar também projetos de licitação", desc: "Desligado: contas de projeto de licitação (ou da categoria Licitações) não recebem nenhum desses e-mails — órgão público paga pelo rito do contrato." })}
        <p className="px-2 pt-3 text-xs font-semibold text-muted-foreground">Sino para a equipe</p>
        {Linha({ id: "av-pagar", ligado: cfg.contasAPagar, onChange: (v) => setCfg({ ...cfg, contasAPagar: v }), titulo: "Contas a pagar vencendo", desc: "Avisa quem lançou a conta 3 dias e 1 dia antes do vencimento, numa notificação só por dia. Quem não vê o financeiro não recebe: o aviso vai para quem gere." })}
        <div className="flex justify-end pt-2">
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar avisos"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SenhaExclusaoCard({ inicial }: { inicial: { exigir: boolean; temSenha: boolean } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [exigir, setExigir] = useState(inicial.exigir);
  const [senha, setSenha] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");

  function salvar() {
    start(async () => {
      const r = await salvarSenhaExclusao({ exigir, senha: senha || "", senhaAtual: senhaAtual || "" });
      if (r.ok) {
        toast.success("Configuração de exclusão salva.");
        setSenha("");
        setSenhaAtual("");
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
        {inicial.temSenha && (
          <div className="space-y-1.5">
            <Label className="text-xs">Senha atual (para trocar a senha ou desligar a exigência)</Label>
            <Input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} className="w-60" autoComplete="off" />
          </div>
        )}
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

  function setAte(i: number, v: number | null) {
    setFaixas((p) => p.map((f, idx) => (idx === i ? { ...f, ate: v === null ? null : Math.max(0, v) } : f)));
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
              <InputMoeda
                semPrefixo
                value={f.ate}
                onChange={(v) => setAte(i, v)}
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

  function set(k: keyof Aliquotas, v: number | null) {
    setAliq((p) => ({ ...p, [k]: Math.max(0, Math.min(100, v ?? 0)) }));
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
              <InputPercentual value={aliq[c.key]} onChange={(v) => set(c.key, v)} />
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
