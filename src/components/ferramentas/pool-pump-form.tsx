"use client";

import { useState, useMemo } from "react";
import { ZodError } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calcular, CHAVES_USO, FORMAS, USOS, type EntradaPiscinaInput } from "@/modules/ferramentas/calc/pool-pump";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";
import { BlocoMotor, BlocoTrecho, Pendencia, Prop, SelectDn, invalidosDigitados, num, pend, percentual, texto, textoDasPendencias } from "./hidraulica-campos";
import { AlertaCalculo } from "./alerta-calculo";
import { GuiaFerramenta, GuiaGrupo } from "./guia/guia-ferramenta";
import { BombaPiscinaSchematic } from "./guia/schematics/bomba-piscina";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

type Estado = {
  forma: string;
  comprimento: string;
  largura: string;
  diametro: string;
  profundidade: string;
  volume: string;
  uso: string;
  horas: string;
  compSuccao: string;
  leqSuccao: string;
  compRetorno: string;
  leqRetorno: string;
  dnSuccao: string;
  dnRetorno: string;
  perdaEquip: string;
  pressaoRetorno: string;
  taxa: string;
  coef: string;
  rendimento: string;
};

function estadoInicial(e?: Record<string, unknown>): Estado {
  return {
    forma: texto(e?.forma, "retangular"),
    comprimento: texto(e?.comprimentoM, ""),
    largura: texto(e?.larguraM, ""),
    diametro: texto(e?.diametroM, ""),
    profundidade: texto(e?.profundidadeMediaM, ""),
    volume: texto(e?.volumeM3, ""),
    uso: texto(e?.uso, "residencial"),
    horas: texto(e?.horasRecirculacao, ""),
    compSuccao: texto(e?.comprimentoSuccaoM, ""),
    leqSuccao: texto(e?.leqSuccaoM, "0"),
    compRetorno: texto(e?.comprimentoRetornoM, ""),
    leqRetorno: texto(e?.leqRetornoM, "0"),
    dnSuccao: texto(e?.dnSuccao, "auto"),
    dnRetorno: texto(e?.dnRetorno, "auto"),
    perdaEquip: texto(e?.perdaEquipamentosMca, "0"),
    pressaoRetorno: texto(e?.pressaoRetornoMca, "0"),
    taxa: texto(e?.taxaFiltracao, ""),
    coef: texto(e?.coeficienteHW, "140"),
    rendimento: percentual(e?.rendimento, "50"),
  };
}

/** Campos que faltam ou estão fora da faixa, nomeados para a orientação da tela. */
function pendencias(st: Estado): Pendencia[] {
  const p: Pendencia[] = [];
  const dentro = (v: string, min: number, max: number) => num(v) >= min && num(v) <= max;
  if (st.forma === "volume") {
    if (!(num(st.volume) > 0)) p.push(pend("h03-vol", st.volume, "volume"));
  } else {
    if (st.forma === "retangular") {
      if (!(num(st.comprimento) > 0)) p.push(pend("h03-comp", st.comprimento, "comprimento da piscina"));
      if (!(num(st.largura) > 0)) p.push(pend("h03-larg", st.largura, "largura da piscina"));
    } else if (!(num(st.diametro) > 0)) p.push(pend("h03-diam", st.diametro, "diâmetro da piscina"));
    if (!(num(st.profundidade) > 0)) p.push(pend("h03-prof", st.profundidade, "profundidade média"));
  }
  if (st.horas.trim() !== "" && !(num(st.horas) > 0 && num(st.horas) <= 24)) p.push(pend("h03-horas", st.horas, "tempo de recirculação (até 24 h)"));
  if (!(num(st.compSuccao) > 0)) p.push(pend("h03-ls", st.compSuccao, "comprimento da sucção"));
  if (!(num(st.compRetorno) > 0)) p.push(pend("h03-lr", st.compRetorno, "comprimento do retorno"));
  if (!dentro(st.coef, 60, 160)) p.push(pend("h03-coef", st.coef, "coeficiente C (60 a 160)"));
  if (!dentro(st.rendimento, 10, 95)) p.push(pend("h03-eta", st.rendimento, "rendimento (10 a 95 %)"));
  return p;
}

function montarEntrada(st: Estado): EntradaPiscinaInput {
  const e: EntradaPiscinaInput = {
    forma: st.forma as EntradaPiscinaInput["forma"],
    uso: st.uso as EntradaPiscinaInput["uso"],
    comprimentoSuccaoM: num(st.compSuccao),
    comprimentoRetornoM: num(st.compRetorno),
    leqSuccaoM: Math.max(0, num(st.leqSuccao) || 0),
    leqRetornoM: Math.max(0, num(st.leqRetorno) || 0),
    perdaEquipamentosMca: Math.max(0, num(st.perdaEquip) || 0),
    pressaoRetornoMca: Math.max(0, num(st.pressaoRetorno) || 0),
    coeficienteHW: num(st.coef),
    rendimento: num(st.rendimento) / 100,
  };
  // Medidas de outra forma ficam de fora: um valor antigo não pode contar no volume.
  if (st.forma === "volume") {
    e.volumeM3 = num(st.volume);
  } else {
    e.profundidadeMediaM = num(st.profundidade);
    if (st.forma === "retangular") {
      e.comprimentoM = num(st.comprimento);
      e.larguraM = num(st.largura);
    } else {
      e.diametroM = num(st.diametro);
    }
  }
  if (num(st.horas) > 0) e.horasRecirculacao = num(st.horas);
  if (num(st.taxa) > 0) e.taxaFiltracao = num(st.taxa);
  if (st.dnSuccao !== "auto") e.dnSuccao = Number(st.dnSuccao);
  if (st.dnRetorno !== "auto") e.dnRetorno = Number(st.dnRetorno);
  return e;
}

export function PoolPumpForm({ initialEntradas, onSalvo }: Props) {
  const [st, setSt] = useState<Estado>(() => estadoInicial(initialEntradas));
  const [salvarOpen, setSalvarOpen] = useState(false);

  const set = (k: keyof Estado) => (v: string) => setSt((a) => ({ ...a, [k]: v }));

  const invalidos = useMemo(() => invalidosDigitados(pendencias(st)), [st]);
  const { entrada, resultado, orientacao } = useMemo(() => {
    const falta = pendencias(st);
    if (falta.length > 0) return { entrada: null, resultado: null, orientacao: `Falta informar ou corrigir: ${textoDasPendencias(falta)}.` };
    const e = montarEntrada(st);
    try {
      return { entrada: e, resultado: calcular(e), orientacao: null };
    } catch (err) {
      return { entrada: e, resultado: null, orientacao: err instanceof ZodError ? (err.issues[0]?.message ?? "Não foi possível calcular.") : "Não foi possível calcular." };
    }
  }, [st]);

  const uso = USOS[st.uso as keyof typeof USOS];

  return (
    <div className="space-y-6">
      <GuiaFerramenta slug="bomba-piscina" desenho={<BombaPiscinaSchematic />}>
<GuiaGrupo n={1}>
<div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="h03-forma">Forma</Label>
            <Select value={st.forma} onValueChange={(v) => v && set("forma")(v)}>
              <SelectTrigger className="w-full" id="h03-forma" aria-label="Forma da piscina"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(FORMAS) as (keyof typeof FORMAS)[]).map((k) => (
                  <SelectItem key={k} value={k}>{FORMAS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {st.forma === "retangular" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="h03-comp">Comprimento (m)</Label>
                <Input id="h03-comp" aria-invalid={invalidos.has("h03-comp") || undefined} type="number" step="0.1" value={st.comprimento} onChange={(e) => set("comprimento")(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h03-larg">Largura (m)</Label>
                <Input id="h03-larg" aria-invalid={invalidos.has("h03-larg") || undefined} type="number" step="0.1" value={st.largura} onChange={(e) => set("largura")(e.target.value)} className="font-mono" />
              </div>
            </>
          )}
          {st.forma === "circular" && (
            <div className="space-y-1.5">
              <Label htmlFor="h03-diam">Diâmetro (m)</Label>
              <Input id="h03-diam" aria-invalid={invalidos.has("h03-diam") || undefined} type="number" step="0.1" value={st.diametro} onChange={(e) => set("diametro")(e.target.value)} className="font-mono" />
            </div>
          )}
          {st.forma === "volume" ? (
            <div className="space-y-1.5">
              <Label htmlFor="h03-vol">Volume (m³)</Label>
              <Input id="h03-vol" aria-invalid={invalidos.has("h03-vol") || undefined} type="number" value={st.volume} onChange={(e) => set("volume")(e.target.value)} className="font-mono" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="h03-prof">Profundidade média (m)</Label>
              <Input id="h03-prof" aria-invalid={invalidos.has("h03-prof") || undefined} type="number" step="0.1" value={st.profundidade} onChange={(e) => set("profundidade")(e.target.value)} className="font-mono" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="h03-uso">Uso</Label>
            <Select value={st.uso} onValueChange={(v) => v && set("uso")(v)}>
              <SelectTrigger className="w-full" id="h03-uso" aria-label="Uso da piscina"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHAVES_USO.map((k) => (
                  <SelectItem key={k} value={k}>{USOS[k].label} — {USOS[k].horas} h</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h03-horas">Tempo de recirculação (h)</Label>
            <Input id="h03-horas" aria-invalid={invalidos.has("h03-horas") || undefined} type="number" step="0.5" value={st.horas} onChange={(e) => set("horas")(e.target.value)} className="font-mono" placeholder={uso ? String(uso.horas) : ""} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Sem tempo digitado, vale o do uso escolhido. Os tempos por uso são prática de projeto: confirme na NBR 10339.
        </p>
      </div>
</GuiaGrupo>

      <GuiaGrupo n={2}>
<div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="h03-ls">Sucção: comprimento (m)</Label>
            <Input id="h03-ls" aria-invalid={invalidos.has("h03-ls") || undefined} type="number" step="0.1" value={st.compSuccao} onChange={(e) => set("compSuccao")(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h03-les">Sucção: comprimento equivalente das conexões (m)</Label>
            <Input id="h03-les" type="number" step="0.1" value={st.leqSuccao} onChange={(e) => set("leqSuccao")(e.target.value)} className="font-mono" />
          </div>
          <SelectDn id="h03-dns" rotulo="Diâmetro da sucção" valor={st.dnSuccao} onChange={set("dnSuccao")} adotado={resultado?.succao.dn ?? null} />
          <div className="space-y-1.5">
            <Label htmlFor="h03-lr">Retorno: comprimento (m)</Label>
            <Input id="h03-lr" aria-invalid={invalidos.has("h03-lr") || undefined} type="number" step="0.1" value={st.compRetorno} onChange={(e) => set("compRetorno")(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h03-ler">Retorno: comprimento equivalente das conexões (m)</Label>
            <Input id="h03-ler" type="number" step="0.1" value={st.leqRetorno} onChange={(e) => set("leqRetorno")(e.target.value)} className="font-mono" />
          </div>
          <SelectDn id="h03-dnr" rotulo="Diâmetro do retorno" valor={st.dnRetorno} onChange={set("dnRetorno")} adotado={resultado?.retorno.dn ?? null} />
          <div className="space-y-1.5">
            <Label htmlFor="h03-coef">Coeficiente C (Hazen-Williams)</Label>
            <Input id="h03-coef" aria-invalid={invalidos.has("h03-coef") || undefined} type="number" value={st.coef} onChange={(e) => set("coef")(e.target.value)} className="font-mono" />
          </div>
        </div>
      </div>
</GuiaGrupo>

      <GuiaGrupo n={3}>
<div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="h03-eq">Perda nos equipamentos (mca)</Label>
            <Input id="h03-eq" type="number" step="0.1" value={st.perdaEquip} onChange={(e) => set("perdaEquip")(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h03-pr">Pressão nos retornos (mca)</Label>
            <Input id="h03-pr" type="number" step="0.1" value={st.pressaoRetorno} onChange={(e) => set("pressaoRetorno")(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h03-taxa">Taxa de filtração (m³/h por m²)</Label>
            <Input id="h03-taxa" type="number" value={st.taxa} onChange={(e) => set("taxa")(e.target.value)} className="font-mono" placeholder="opcional" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h03-eta">Rendimento (%)</Label>
            <Input id="h03-eta" aria-invalid={invalidos.has("h03-eta") || undefined} type="number" value={st.rendimento} onChange={(e) => set("rendimento")(e.target.value)} className="font-mono" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Perda do filtro, do pré-filtro e do aquecedor, pressão dos retornos e taxa de filtração vêm do catálogo do fabricante e não têm valor padrão: 0 quer dizer não informado. Sem a taxa de filtração, a área filtrante não é calculada.
        </p>
      </div>
</GuiaGrupo>
</GuiaFerramenta>

      {!resultado && orientacao && (
        <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{orientacao}</p>
      )}

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2">
            <Prop simbolo="V" valor={fmtNum(resultado.volumeM3, 1)} un="m³" />
            <Prop simbolo="Q" valor={fmtNum(resultado.vazaoM3h, 2)} un="m³/h" />
            <Prop simbolo="Q" valor={fmtNum(resultado.vazaoLs, 3)} un="L/s" />
            {resultado.areaFiltranteM2 != null && <Prop simbolo="Área filtrante" valor={fmtNum(resultado.areaFiltranteM2, 2)} un="m²" />}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BlocoTrecho nome="Sucção" t={resultado.succao} automatico={resultado.succaoAutomatico} />
            <BlocoTrecho nome="Retorno" t={resultado.retorno} automatico={resultado.retornoAutomatico} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2">
            <Prop simbolo="Σhf" valor={fmtNum(resultado.perdaTubulacaoMca, 2)} un="mca" />
            <Prop simbolo="Hm" valor={fmtNum(resultado.alturaManometricaM, 2)} un="mca" destaque />
          </div>
          <BlocoMotor m={resultado.motor} />
          {resultado.alertas.map((a) => (
            <AlertaCalculo key={a}>{a}</AlertaCalculo>
          ))}
        </div>
      )}

      <Footer
        ferramenta="bomba-piscina"
        titulo={`Bomba de piscina — ${resultado ? `${fmtNum(resultado.volumeM3, 0)} m³` : "—"}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => setSt(estadoInicial(n))}
        onSalvo={onSalvo}
      />
    </div>
  );
}
