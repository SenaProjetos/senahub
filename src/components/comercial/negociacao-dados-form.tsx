"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { editarNegociacao } from "@/modules/comercial/actions";
import type { FichaNegociacao } from "@/modules/comercial/queries";
import { TEMPERATURAS, TEMPERATURA_ICONE, TEMPERATURA_LABEL } from "@/modules/comercial/temperatura";
import { paraData } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** base-ui recusa `value=""` no Select — sentinela para "nenhum". */
const NENHUM = "__nenhum";

type Opcao = { id: string; nome: string };

function paraIsoDia(iso: string | null): string {
  const d = paraData(iso);
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function SelectOpcional({
  id,
  valor,
  onChange,
  opcoes,
  vazio,
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: Opcao[];
  vazio: string;
}) {
  const itens = [{ value: NENHUM, label: vazio }, ...opcoes.map((o) => ({ value: o.id, label: o.nome }))];
  return (
    <Select value={valor || NENHUM} onValueChange={(v) => onChange(!v || v === NENHUM ? "" : v)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {itens.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Dados editáveis da negociação. Estágio não está aqui (muda arrastando no funil) e valor
 * proposto/desconto também não — vêm da proposta vigente, mostrada na aba Propostas.
 */
export function NegociacaoDadosForm({
  negociacao: n,
  responsaveis,
  parceiros,
  campanhas,
  tipos,
  podeGerir,
}: {
  negociacao: FichaNegociacao;
  responsaveis: { id: string; name: string }[];
  parceiros: Opcao[];
  campanhas: Opcao[];
  tipos: Opcao[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [titulo, setTitulo] = useState(n.titulo);
  const [responsavelId, setResponsavelId] = useState(n.responsavelId ?? "");
  const [temperatura, setTemperatura] = useState<string>(n.temperatura ?? "");
  const [valorEstimado, setValorEstimado] = useState<number | null>(n.valorEstimado);
  const [previsao, setPrevisao] = useState(paraIsoDia(n.previsaoFechamento));
  const [manual, setManual] = useState(n.probabilidadeOverride);
  const [probabilidade, setProbabilidade] = useState(String(n.probabilidade));
  const [parceiroId, setParceiroId] = useState(n.parceiroId ?? "");
  const [campanhaId, setCampanhaId] = useState(n.campaignId ?? "");
  const [tipoId, setTipoId] = useState(n.tipoEmpreendimentoId ?? "");
  const [area, setArea] = useState(n.areaM2 != null ? String(n.areaM2) : "");

  function salvar() {
    const prob = manual ? Number(probabilidade) : null;
    if (manual && (!Number.isInteger(prob) || prob! < 0 || prob! > 100)) {
      toast.error("Probabilidade deve ser um número inteiro de 0 a 100.");
      return;
    }
    const areaNum = area.trim() ? Number(area.replace(",", ".")) : null;
    if (areaNum != null && (Number.isNaN(areaNum) || areaNum < 0)) {
      toast.error("Área inválida.");
      return;
    }
    start(async () => {
      const r = await editarNegociacao({
        id: n.id,
        titulo,
        responsavelId,
        temperatura: temperatura ? (temperatura as "FRIO" | "MORNO" | "QUENTE") : null,
        valorEstimado,
        previsaoFechamento: previsao,
        probabilidade: prob,
        parceiroId,
        campanhaId,
        tipoEmpreendimentoId: tipoId,
        areaM2: areaNum,
      });
      if (r.ok) {
        toast.success("Negociação atualizada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const opcoesTemperatura = [
    { id: "", nome: "Não classificada" },
    ...TEMPERATURAS.map((t) => ({ id: t, nome: `${TEMPERATURA_ICONE[t]} ${TEMPERATURA_LABEL[t]}` })),
  ];

  return (
    <fieldset disabled={!podeGerir || pending} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="neg-titulo">Demanda</Label>
        <Input id="neg-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="neg-resp">Responsável</Label>
          <SelectOpcional
            id="neg-resp"
            valor={responsavelId}
            onChange={setResponsavelId}
            opcoes={responsaveis.map((u) => ({ id: u.id, nome: u.name }))}
            vazio="Sem responsável"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="neg-temp">Temperatura</Label>
          <SelectOpcional
            id="neg-temp"
            valor={temperatura}
            onChange={setTemperatura}
            opcoes={opcoesTemperatura.slice(1)}
            vazio={opcoesTemperatura[0].nome}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="neg-valor">Valor estimado</Label>
          <InputMoeda id="neg-valor" value={valorEstimado} onChange={setValorEstimado} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="neg-prev">Previsão de fechamento</Label>
          <Input id="neg-prev" type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="neg-prob">Probabilidade (%)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="neg-prob"
              inputMode="numeric"
              className="w-20"
              value={probabilidade}
              disabled={!manual}
              onChange={(e) => setProbabilidade(e.target.value)}
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox checked={manual} onCheckedChange={(v) => setManual(v === true)} />
              Definir manualmente
            </label>
          </div>
          {!manual && <p className="text-[11px] text-muted-foreground">Segue o estágio atual.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="neg-parc">Parceiro</Label>
          <SelectOpcional id="neg-parc" valor={parceiroId} onChange={setParceiroId} opcoes={parceiros} vazio="Sem parceiro" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="neg-camp">Campanha</Label>
          <SelectOpcional id="neg-camp" valor={campanhaId} onChange={setCampanhaId} opcoes={campanhas} vazio="Sem campanha" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="neg-tipo">Tipo de empreendimento</Label>
          <SelectOpcional id="neg-tipo" valor={tipoId} onChange={setTipoId} opcoes={tipos} vazio="Não informado" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="neg-area">Área (m²)</Label>
          <Input id="neg-area" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
        </div>
      </div>
      {podeGerir && (
        <div className="flex justify-end">
          <Button onClick={salvar} disabled={pending || !titulo.trim()}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      )}
    </fieldset>
  );
}
