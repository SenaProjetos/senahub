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
import {
  calcular,
  CHAVES_OCUPACAO,
  OCUPACOES,
  SISTEMAS,
  type EntradaReservatorioInput,
  type ReservatorioDimensionado,
} from "@/modules/ferramentas/calc/reservoir";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";
import { percentual, texto } from "./hidraulica-campos";
import { Prop } from "./prop";
import { AlertaCalculo } from "./alerta-calculo";
import { GuiaFerramenta, GuiaGrupo } from "./guia/guia-ferramenta";
import { ReservatoriosSchematic } from "./guia/schematics/reservatorios";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };


type Estado = {
  ocupacao: string;
  unidades: string;
  consumo: string;
  dias: string;
  sistema: string;
  fracaoInferior: string;
  rtiModo: string;
  rtiVolume: string;
  rtiHidrantes: string;
  rtiVazao: string;
  rtiMinutos: string;
  rtiEm: string;
  alturaInferior: string;
  alturaSuperior: string;
};

function estadoInicial(e?: Record<string, unknown>): Estado {
  return {
    ocupacao: texto(e?.ocupacao, "residencia_media"),
    unidades: texto(e?.unidades, ""),
    consumo: texto(e?.consumoLitrosDia, ""),
    dias: texto(e?.diasReserva, "2"),
    sistema: texto(e?.sistema, "inferior_superior"),
    fracaoInferior: percentual(e?.fracaoInferior, "60"),
    rtiModo: texto(e?.rtiModo, "nenhuma"),
    rtiVolume: texto(e?.rtiVolumeM3, ""),
    rtiHidrantes: texto(e?.rtiHidrantes, ""),
    rtiVazao: texto(e?.rtiVazaoLMin, ""),
    rtiMinutos: texto(e?.rtiMinutos, ""),
    rtiEm: texto(e?.rtiEm, "superior"),
    alturaInferior: texto(e?.alturaUtilInferiorM, ""),
    alturaSuperior: texto(e?.alturaUtilSuperiorM, ""),
  };
}

/** Campo do esquema do motor → id do input, para marcar `aria-invalid` no campo que o erro cita. */
const CAMPO_DO_ESQUEMA: Record<string, string> = {
  unidades: "h01-unidades",
  diasReserva: "h01-dias",
  consumoLitrosDia: "h01-consumo",
  fracaoInferior: "h01-fracao",
  alturaUtilInferiorM: "h01-hinf",
  alturaUtilSuperiorM: "h01-hsup",
  rtiVolumeM3: "h01-rti",
  rtiHidrantes: "h01-hid",
  rtiVazaoLMin: "h01-vaz",
  rtiMinutos: "h01-min",
};

function montarEntrada(st: Estado): EntradaReservatorioInput | null {
  const n = (v: string) => Number(v.replace(",", "."));
  if (!(n(st.unidades) > 0) || !(n(st.dias) > 0)) return null;
  const e: EntradaReservatorioInput = {
    ocupacao: st.ocupacao as EntradaReservatorioInput["ocupacao"],
    unidades: n(st.unidades),
    diasReserva: n(st.dias),
    sistema: st.sistema as EntradaReservatorioInput["sistema"],
    rtiModo: st.rtiModo as EntradaReservatorioInput["rtiModo"],
    rtiEm: st.rtiEm as EntradaReservatorioInput["rtiEm"],
  };
  // Campos ocultos pelo sistema/modo não vão: um valor antigo fora da faixa não pode zerar o resultado.
  if (st.sistema === "inferior_superior") e.fracaoInferior = n(st.fracaoInferior) / 100;
  if (n(st.consumo) > 0) e.consumoLitrosDia = n(st.consumo);
  if (st.rtiModo === "informada" && n(st.rtiVolume) > 0) e.rtiVolumeM3 = n(st.rtiVolume);
  if (st.rtiModo === "calculada") {
    if (n(st.rtiHidrantes) > 0) e.rtiHidrantes = Math.round(n(st.rtiHidrantes));
    if (n(st.rtiVazao) > 0) e.rtiVazaoLMin = n(st.rtiVazao);
    if (n(st.rtiMinutos) > 0) e.rtiMinutos = n(st.rtiMinutos);
  }
  if (st.sistema !== "somente_superior" && n(st.alturaInferior) > 0) e.alturaUtilInferiorM = n(st.alturaInferior);
  if (st.sistema !== "somente_inferior" && n(st.alturaSuperior) > 0) e.alturaUtilSuperiorM = n(st.alturaSuperior);
  return e;
}

export function ReservoirForm({ initialEntradas, onSalvo }: Props) {
  const [st, setSt] = useState<Estado>(() => estadoInicial(initialEntradas));
  const [salvarOpen, setSalvarOpen] = useState(false);

  const set = (k: keyof Estado) => (v: string) => setSt((a) => ({ ...a, [k]: v }));

  const entrada = useMemo(() => montarEntrada(st), [st]);
  const { resultado, orientacao, invalidos } = useMemo(() => {
    // `aria-invalid` só no campo já digitado e errado (o formulário vazio não nasce todo marcado).
    const digitadoErrado = (v: string) => v.trim() !== "" && !(Number(v.replace(",", ".")) > 0);
    const invalidosBase = new Set([
      ...(digitadoErrado(st.unidades) ? ["h01-unidades"] : []),
      ...(digitadoErrado(st.dias) ? ["h01-dias"] : []),
    ]);
    if (!entrada) return { resultado: null, orientacao: "Informe a quantidade de unidades e os dias de reserva.", invalidos: invalidosBase };
    try {
      return { resultado: calcular(entrada), orientacao: null, invalidos: invalidosBase };
    } catch (e) {
      // As mensagens do esquema já dizem o que falta ("Informe o consumo por unidade.").
      if (!(e instanceof ZodError)) return { resultado: null, orientacao: "Não foi possível calcular.", invalidos: invalidosBase };
      const dosIssues = e.issues.map((i) => CAMPO_DO_ESQUEMA[String(i.path[0])]).filter((id): id is string => !!id);
      return { resultado: null, orientacao: e.issues[0]?.message ?? null, invalidos: new Set([...invalidosBase, ...dosIssues]) };
    }
  }, [entrada, st.unidades, st.dias]);

  const ocup = st.ocupacao === "personalizado" ? null : OCUPACOES[st.ocupacao as keyof typeof OCUPACOES];
  const doisReservatorios = st.sistema === "inferior_superior";

  return (
    <div className="space-y-6">
      <GuiaFerramenta slug="reservatorios" desenho={<ReservatoriosSchematic />}>
<GuiaGrupo n={1}>
<div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label>Ocupação</Label>
            <Select value={st.ocupacao} onValueChange={(v) => v && set("ocupacao")(v)}>
              <SelectTrigger className="w-full" aria-label="Ocupação"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHAVES_OCUPACAO.map((k) => (
                  <SelectItem key={k} value={k}>{OCUPACOES[k].label}</SelectItem>
                ))}
                <SelectItem value="personalizado">Personalizada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h01-unidades">Quantidade{ocup ? ` (${ocup.unidade})` : ""}</Label>
            <Input id="h01-unidades" aria-invalid={invalidos.has("h01-unidades") || undefined} type="number" value={st.unidades} onChange={(e) => set("unidades")(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h01-consumo">Consumo (L/dia por unidade)</Label>
            <Input
              id="h01-consumo"
              aria-invalid={invalidos.has("h01-consumo") || undefined}
              type="number"
              value={st.consumo}
              placeholder={ocup ? String(ocup.litrosPorDia) : "informe"}
              onChange={(e) => set("consumo")(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Os valores da tabela são consumos usuais de projeto (a NBR 5626 não os fixa). Digite o consumo para substituí-lo.
        </p>
      </div>
</GuiaGrupo>

      <GuiaGrupo n={2}>
<div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="h01-dias">Dias de reserva</Label>
            <Input id="h01-dias" aria-invalid={invalidos.has("h01-dias") || undefined} type="number" step="0.5" value={st.dias} onChange={(e) => set("dias")(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Sistema</Label>
            <Select value={st.sistema} onValueChange={(v) => v && set("sistema")(v)}>
              <SelectTrigger className="w-full" aria-label="Sistema de reservatórios"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SISTEMAS) as (keyof typeof SISTEMAS)[]).map((k) => (
                  <SelectItem key={k} value={k}>{SISTEMAS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {doisReservatorios && (
            <div className="space-y-1.5">
              <Label htmlFor="h01-fracao">Parcela no inferior (%)</Label>
              <Input id="h01-fracao" aria-invalid={invalidos.has("h01-fracao") || undefined} type="number" value={st.fracaoInferior} onChange={(e) => set("fracaoInferior")(e.target.value)} className="font-mono" />
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {st.sistema !== "somente_superior" && (
            <div className="space-y-1.5">
              <Label htmlFor="h01-hinf">Altura útil do inferior (m)</Label>
              <Input id="h01-hinf" aria-invalid={invalidos.has("h01-hinf") || undefined} type="number" step="0.1" value={st.alturaInferior} onChange={(e) => set("alturaInferior")(e.target.value)} className="font-mono" placeholder="opcional" />
            </div>
          )}
          {st.sistema !== "somente_inferior" && (
            <div className="space-y-1.5">
              <Label htmlFor="h01-hsup">Altura útil do superior (m)</Label>
              <Input id="h01-hsup" aria-invalid={invalidos.has("h01-hsup") || undefined} type="number" step="0.1" value={st.alturaSuperior} onChange={(e) => set("alturaSuperior")(e.target.value)} className="font-mono" placeholder="opcional" />
            </div>
          )}
        </div>
      </div>
</GuiaGrupo>

      <GuiaGrupo n={3}>
<div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Como informar</Label>
            <Select value={st.rtiModo} onValueChange={(v) => v && set("rtiModo")(v)}>
              <SelectTrigger className="w-full" aria-label="Como informar a reserva técnica de incêndio"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Não considerar</SelectItem>
                <SelectItem value="informada">Volume informado</SelectItem>
                <SelectItem value="calculada">Calcular (hidrantes × vazão × tempo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {st.rtiModo === "informada" && (
            <div className="space-y-1.5">
              <Label htmlFor="h01-rti">Volume (m³)</Label>
              <Input id="h01-rti" aria-invalid={invalidos.has("h01-rti") || undefined} type="number" value={st.rtiVolume} onChange={(e) => set("rtiVolume")(e.target.value)} className="font-mono" />
            </div>
          )}
          {st.rtiModo === "calculada" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="h01-hid">Hidrantes simultâneos</Label>
                <Input id="h01-hid" aria-invalid={invalidos.has("h01-hid") || undefined} type="number" value={st.rtiHidrantes} onChange={(e) => set("rtiHidrantes")(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h01-vaz">Vazão por hidrante (L/min)</Label>
                <Input id="h01-vaz" aria-invalid={invalidos.has("h01-vaz") || undefined} type="number" value={st.rtiVazao} onChange={(e) => set("rtiVazao")(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h01-min">Tempo de funcionamento (min)</Label>
                <Input id="h01-min" aria-invalid={invalidos.has("h01-min") || undefined} type="number" value={st.rtiMinutos} onChange={(e) => set("rtiMinutos")(e.target.value)} className="font-mono" />
              </div>
            </>
          )}
          {st.rtiModo !== "nenhuma" && doisReservatorios && (
            <div className="space-y-1.5">
              <Label htmlFor="h01-rti-em">Fica no reservatório</Label>
              <Select value={st.rtiEm} onValueChange={(v) => v && set("rtiEm")(v)}>
                <SelectTrigger className="w-full" id="h01-rti-em" aria-label="Fica no reservatório da reserva técnica de incêndio"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="superior">Superior</SelectItem>
                  <SelectItem value="inferior">Inferior</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Número de hidrantes e tempo vêm da instrução técnica do Corpo de Bombeiros do estado (a NBR 13714 define a vazão mínima por tipo de hidrante). Não há valor padrão.
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
            <Prop simbolo="CD" valor={fmtNum(resultado.consumoDiarioL, 0)} un="L/dia" />
            <Prop simbolo="V reserva" valor={fmtNum(resultado.volumeReservaL, 0)} un="L" />
            <Prop simbolo="V total" valor={fmtNum(resultado.totalL, 0)} un="L" destaque />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {resultado.inferior && <Reservatorio nome="Inferior" d={resultado.inferior} />}
            {resultado.superior && <Reservatorio nome="Superior" d={resultado.superior} />}
          </div>
          {resultado.alertas.map((a) => (
            <AlertaCalculo key={a}>{a}</AlertaCalculo>
          ))}
        </div>
      )}

      <Footer
        ferramenta="reservatorios"
        titulo={`Reservatórios — ${ocup ? ocup.label : "personalizada"}, ${st.unidades || "—"} un.`}
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

function Reservatorio({ nome, d }: { nome: string; d: ReservatorioDimensionado }) {
  return (
    <div className="rounded-md border bg-background p-3 space-y-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{nome}</h3>
      <p className="font-mono text-base font-semibold">
        {fmtNum(d.totalL, 0)} L <span className="text-xs font-normal text-muted-foreground">({fmtNum(d.totalM3, 2)} m³)</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Consumo {fmtNum(d.consumoL, 0)} L{d.rtiL > 0 && <> + incêndio {fmtNum(d.rtiL, 0)} L</>}
      </p>
      {d.areaM2 != null && d.ladoQuadradoM != null && (
        <p className="text-xs text-muted-foreground">
          Planta: {fmtNum(d.areaM2, 2)} m² (≈ {fmtNum(d.ladoQuadradoM, 2)} × {fmtNum(d.ladoQuadradoM, 2)} m)
        </p>
      )}
    </div>
  );
}

