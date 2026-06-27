"use client";

import { useState, useEffect } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNIDADES, DIMENSOES, converter, type Dimensao } from "@/modules/ferramentas/calc/unit-convert";
import { SalvarDialog } from "./salvar-dialog";
import { SavefileButtons } from "./savefile-buttons";
import { GuiaFerramenta, GuiaGrupo } from "./guia/guia-ferramenta";
import { UnitConvertSchematic } from "./guia/schematics/conversor-unidades";

const DIMENSAO_LABELS: Record<Dimensao, string> = {
  comprimento: "Comprimento",
  area: "Área",
  volume: "Volume",
  massa: "Massa",
  forca: "Força",
  tensao: "Tensão / Pressão",
  momento: "Momento",
  vazao: "Vazão",
  angulo: "Ângulo",
};

type Resultado = {
  valor: number;
  de: string;
  para: string;
  fator: number;
} | null;

type Props = {
  initialEntradas?: Record<string, unknown>;
  onSalvo: (id: string) => void;
};

function formatarResultado(valor: number): string {
  if (Math.abs(valor) >= 1e9 || (Math.abs(valor) < 1e-4 && valor !== 0)) {
    return valor.toExponential(6);
  }
  // Remove trailing zeros, mantem até 10 dígitos significativos
  return parseFloat(valor.toPrecision(10)).toString();
}

export function UnitConvertForm({ initialEntradas, onSalvo }: Props) {
  const defaultDimensao: Dimensao = "forca";
  const unidadesDim = UNIDADES[defaultDimensao];
  const primeiraUnidade = Object.keys(unidadesDim)[0];

  const initDim = (initialEntradas?.dimensao as Dimensao) ?? defaultDimensao;
  const initDe = (initialEntradas?.de as string) ?? primeiraUnidade;
  const initPara = (initialEntradas?.para as string) ?? Object.keys(UNIDADES[initDim])[1] ?? primeiraUnidade;
  const initValor = (initialEntradas?.valor as number) ?? 1;

  const [dimensao, setDimensao] = useState<Dimensao>(initDim);
  const [de, setDe] = useState(initDe);
  const [para, setPara] = useState(initPara);
  const [valor, setValor] = useState(String(initValor));
  const [resultado, setResultado] = useState<Resultado>(null);
  const [salvarOpen, setSalvarOpen] = useState(false);

  const unidadesDimensao = UNIDADES[dimensao];
  const opcoesUnidade = Object.entries(unidadesDimensao).map(([key, u]) => ({ key, label: u.label }));

  // Garante que de/para existem na dimensão selecionada
  useEffect(() => {
    const opcoes = Object.keys(UNIDADES[dimensao]);
    if (!opcoes.includes(de)) setDe(opcoes[0]);
    if (!opcoes.includes(para)) setPara(opcoes[1] ?? opcoes[0]);
  }, [dimensao]); // eslint-disable-line react-hooks/exhaustive-deps

  function calcular() {
    const num = parseFloat(valor);
    if (isNaN(num)) return;
    try {
      const r = converter({ dimensao, valor: num, de, para });
      setResultado(r);
    } catch {
      setResultado(null);
    }
  }

  // Recalcula automaticamente quando os inputs mudam
  useEffect(() => {
    calcular();
  }, [dimensao, de, para, valor]); // eslint-disable-line react-hooks/exhaustive-deps

  function trocarUnidades() {
    setDe(para);
    setPara(de);
  }

  const entradas = { dimensao, valor: parseFloat(valor) || 0, de, para };
  const tituloSugerido = `Conversor ${de} → ${para}`;
  const temResultado = resultado !== null && !isNaN(parseFloat(valor));

  // Recarrega form quando recebe entradas externas (import .shcalc)
  function handleImport(novasEntradas: Record<string, unknown>, novoTitulo: string) {
    if (novasEntradas.dimensao && DIMENSOES.includes(novasEntradas.dimensao as Dimensao)) {
      setDimensao(novasEntradas.dimensao as Dimensao);
    }
    if (typeof novasEntradas.valor === "number") setValor(String(novasEntradas.valor));
    if (typeof novasEntradas.de === "string") setDe(novasEntradas.de);
    if (typeof novasEntradas.para === "string") setPara(novasEntradas.para);
    void novoTitulo;
  }

  return (
    <div className="space-y-6">
      <GuiaFerramenta slug="conversor-unidades" desenho={<UnitConvertSchematic />}>
        <GuiaGrupo n={1}>
          <div className="space-y-1.5">
            <Label>Grandeza</Label>
            <Select value={dimensao} onValueChange={(v) => v && setDimensao(v as Dimensao)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIMENSOES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DIMENSAO_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={2}>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>De</Label>
              <Select value={de} onValueChange={(v) => v && setDe(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opcoesUnidade.map((u) => (
                    <SelectItem key={u.key} value={u.key}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={trocarUnidades}
              className="mb-0.5"
              title="Trocar unidades"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>

            <div className="space-y-1.5">
              <Label>Para</Label>
              <Select value={para} onValueChange={(v) => v && setPara(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opcoesUnidade.map((u) => (
                    <SelectItem key={u.key} value={u.key}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={3}>
          <div className="space-y-1.5">
            <Label htmlFor="valor-input">Valor</Label>
            <Input
              id="valor-input"
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0"
              className="text-lg font-mono"
            />
          </div>
        </GuiaGrupo>
      </GuiaFerramenta>

      {/* Resultado */}
      {temResultado && resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Resultado</p>
          <p className="text-2xl font-mono font-semibold">
            {formatarResultado(resultado.valor)}{" "}
            <span className="text-base font-normal text-muted-foreground">
              {unidadesDimensao[resultado.para]?.label ?? resultado.para}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Fator: 1 {unidadesDimensao[resultado.de]?.label ?? resultado.de} ={" "}
            {formatarResultado(resultado.fator)}{" "}
            {unidadesDimensao[resultado.para]?.label ?? resultado.para}
          </p>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button
          type="button"
          disabled={!temResultado}
          onClick={() => setSalvarOpen(true)}
        >
          Salvar cálculo
        </Button>
        <SavefileButtons
          ferramenta="conversor-unidades"
          versaoCalc={1}
          titulo={tituloSugerido}
          entradas={entradas}
          onImport={handleImport}
          disabled={!temResultado}
        />
      </div>

      <SalvarDialog
        open={salvarOpen}
        onOpenChange={setSalvarOpen}
        ferramenta="conversor-unidades"
        tituloSugerido={tituloSugerido}
        entradas={entradas}
        onSalvo={onSalvo}
      />
    </div>
  );
}
