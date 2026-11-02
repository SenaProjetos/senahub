"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import {
  calcular,
  CONTRIBUICOES,
  DISTANCIA_MINIMA_LENCOL_M,
  ORIGENS_CI,
  type EntradaInfiltracaoInput,
} from "@/modules/ferramentas/calc/soil-infiltration";
import {
  ACAO_FURO_DUPLICAR,
  ACAO_FURO_REMOVER,
  MAX_FUROS_LISTA,
  MOTIVO_LISTA_CHEIA_FUROS,
  itensDeFuro,
} from "@/modules/ferramentas/acoes-furo";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";
import { Pendencia, Prop, invalidosDigitados, num, pend, texto, textoDasPendencias } from "./hidraulica-campos";
import { AlertaCalculo } from "./alerta-calculo";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

type Furo = { chave: number; tempoMin: string; rebaixamentoCm: string };

type Geral = {
  contribuicao: string;
  pessoas: string;
  contribuicaoPessoa: string;
  volume: string;
  origemCi: string;
  ciInformado: string;
  diametro: string;
  unidades: string;
  fundo: boolean;
  topo: string;
  nivelAgua: string;
  distanciaMinima: string;
};

let proximaChave = 1;
const novoFuro = (base?: Partial<Furo>): Furo => ({ chave: proximaChave++, tempoMin: "", rebaixamentoCm: "1", ...base });

function furosIniciais(e?: Record<string, unknown>): Furo[] {
  const arr = e?.furos;
  if (!Array.isArray(arr) || arr.length === 0) return [novoFuro()];
  return arr.map((f) => {
    const r = (f ?? {}) as Record<string, unknown>;
    return novoFuro({ tempoMin: texto(r.tempoMin, ""), rebaixamentoCm: texto(r.rebaixamentoCm, "1") });
  });
}

function geralInicial(e?: Record<string, unknown>): Geral {
  return {
    contribuicao: texto(e?.contribuicao, "pessoas"),
    pessoas: texto(e?.pessoas, ""),
    contribuicaoPessoa: texto(e?.contribuicaoLPessoaDia, ""),
    volume: texto(e?.volumeDiarioL, ""),
    origemCi: texto(e?.origemCi, "percolacao"),
    ciInformado: texto(e?.ciInformado, ""),
    diametro: texto(e?.diametroM, ""),
    unidades: texto(e?.unidades, "1"),
    fundo: e?.considerarFundo === true,
    topo: texto(e?.profundidadeTopoM, "0"),
    nivelAgua: texto(e?.nivelAguaM, ""),
    distanciaMinima: texto(e?.distanciaMinimaLencolM, String(DISTANCIA_MINIMA_LENCOL_M)),
  };
}

/** Campos que faltam ou estão fora da faixa, nomeados para a orientação da tela. */
function pendencias(furos: Furo[], g: Geral): Pendencia[] {
  const p: Pendencia[] = [];
  if (g.contribuicao === "pessoas") {
    const n = num(g.pessoas);
    if (!(Number.isInteger(n) && n > 0)) p.push(pend("h04-pessoas", g.pessoas, "número de pessoas (inteiro)"));
    if (!(num(g.contribuicaoPessoa) > 0)) p.push(pend("h04-cpessoa", g.contribuicaoPessoa, "contribuição por pessoa"));
  } else if (!(num(g.volume) > 0)) p.push(pend("h04-vol", g.volume, "volume diário"));
  if (g.origemCi === "percolacao") {
    furos.forEach((f, i) => {
      if (!(num(f.tempoMin) > 0)) p.push(pend(`h04-furo-${i + 1}-tempo`, f.tempoMin, `tempo do furo ${i + 1}`));
      if (!(num(f.rebaixamentoCm) > 0)) p.push(pend(`h04-furo-${i + 1}-rebaixamento`, f.rebaixamentoCm, `rebaixamento do furo ${i + 1}`));
    });
  } else if (!(num(g.ciInformado) > 0)) p.push(pend("h04-ci", g.ciInformado, "coeficiente de infiltração"));
  if (!(num(g.diametro) > 0)) p.push(pend("h04-diam", g.diametro, "diâmetro do sumidouro"));
  const un = num(g.unidades);
  if (!(Number.isInteger(un) && un >= 1 && un <= 20)) p.push(pend("h04-un", g.unidades, "unidades (1 a 20)"));
  if (!(num(g.topo) >= 0)) p.push(pend("h04-topo", g.topo, "profundidade do topo"));
  if (g.nivelAgua.trim() !== "" && !(num(g.nivelAgua) > 0)) p.push(pend("h04-na", g.nivelAgua, "nível d'água"));
  if (!(num(g.distanciaMinima) > 0)) p.push(pend("h04-dist", g.distanciaMinima, "distância mínima ao lençol"));
  return p;
}

function montarEntrada(furos: Furo[], g: Geral): EntradaInfiltracaoInput {
  const e: EntradaInfiltracaoInput = {
    contribuicao: g.contribuicao as EntradaInfiltracaoInput["contribuicao"],
    origemCi: g.origemCi as EntradaInfiltracaoInput["origemCi"],
    diametroM: num(g.diametro),
    unidades: num(g.unidades),
    considerarFundo: g.fundo,
    profundidadeTopoM: num(g.topo),
    distanciaMinimaLencolM: num(g.distanciaMinima),
  };
  // Campos ocultos pelo modo não vão: um valor antigo não pode entrar na conta.
  if (g.contribuicao === "pessoas") {
    e.pessoas = num(g.pessoas);
    e.contribuicaoLPessoaDia = num(g.contribuicaoPessoa);
  } else {
    e.volumeDiarioL = num(g.volume);
  }
  if (g.origemCi === "percolacao") {
    e.furos = furos.map((f) => ({ tempoMin: num(f.tempoMin), rebaixamentoCm: num(f.rebaixamentoCm) }));
  } else {
    e.ciInformado = num(g.ciInformado);
  }
  if (g.nivelAgua.trim() !== "") e.nivelAguaM = num(g.nivelAgua);
  return e;
}

export function SoilInfiltrationForm({ initialEntradas, onSalvo }: Props) {
  const confirm = useConfirm();
  const [furos, setFuros] = useState<Furo[]>(() => furosIniciais(initialEntradas));
  const [g, setGeral] = useState<Geral>(() => geralInicial(initialEntradas));
  const [salvarOpen, setSalvarOpen] = useState(false);

  const invalidos = useMemo(() => invalidosDigitados(pendencias(furos, g)), [furos, g]);
  const { entrada, resultado, orientacao } = useMemo(() => {
    const falta = pendencias(furos, g);
    if (falta.length > 0) return { entrada: null, resultado: null, orientacao: `Falta informar ou corrigir: ${textoDasPendencias(falta)}.` };
    const e = montarEntrada(furos, g);
    try {
      return { entrada: e, resultado: calcular(e), orientacao: null };
    } catch (err) {
      return { entrada: e, resultado: null, orientacao: err instanceof ZodError ? (err.issues[0]?.message ?? "Não foi possível calcular.") : "Não foi possível calcular." };
    }
  }, [furos, g]);

  const setG = <K extends keyof Geral>(k: K, v: Geral[K]) => setGeral((a) => ({ ...a, [k]: v }));
  const setFuro = (chave: number, k: "tempoMin" | "rebaixamentoCm", v: string) =>
    setFuros((a) => a.map((f) => (f.chave === chave ? { ...f, [k]: v } : f)));

  async function executar(chave: number, item: AcaoItemAcao) {
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar,
        variant: item.variant === "destructive" ? "destructive" : "default",
      });
      if (!ok) return;
    }
    // Chave nova criada fora do updater (StrictMode roda o updater duas vezes).
    const nova = novoFuro();
    setFuros((a) => {
      const indice = a.findIndex((f) => f.chave === chave);
      if (indice < 0) return a;
      if (item.id === ACAO_FURO_DUPLICAR) {
        return a.length < MAX_FUROS_LISTA ? [...a.slice(0, indice + 1), { ...a[indice], chave: nova.chave }, ...a.slice(indice + 1)] : a;
      }
      if (item.id === ACAO_FURO_REMOVER) return a.length > 1 ? a.filter((f) => f.chave !== chave) : a;
      return a;
    });
  }

  const porPercolacao = g.origemCi === "percolacao";
  const porPessoas = g.contribuicao === "pessoas";

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-medium">1. Contribuição de esgoto</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="h04-contrib">Como informar</Label>
            <Select value={g.contribuicao} onValueChange={(v) => v && setG("contribuicao", v)}>
              <SelectTrigger id="h04-contrib" aria-label="Como informar a contribuição"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CONTRIBUICOES) as (keyof typeof CONTRIBUICOES)[]).map((k) => (
                  <SelectItem key={k} value={k}>{CONTRIBUICOES[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {porPessoas ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="h04-pessoas">Pessoas</Label>
                <Input id="h04-pessoas" aria-invalid={invalidos.has("h04-pessoas") || undefined} type="number" value={g.pessoas} onChange={(e) => setG("pessoas", e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h04-cpessoa">Contribuição (L por pessoa por dia)</Label>
                <Input id="h04-cpessoa" aria-invalid={invalidos.has("h04-cpessoa") || undefined} type="number" value={g.contribuicaoPessoa} onChange={(e) => setG("contribuicaoPessoa", e.target.value)} className="font-mono" />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="h04-vol">Volume diário (L/dia)</Label>
              <Input id="h04-vol" aria-invalid={invalidos.has("h04-vol") || undefined} type="number" value={g.volume} onChange={(e) => setG("volume", e.target.value)} className="font-mono" />
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          A contribuição por pessoa vem da tabela da norma e não tem valor padrão aqui: digite o valor adotado no projeto.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">2. Coeficiente de infiltração do solo</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="h04-origem">Origem</Label>
            <Select value={g.origemCi} onValueChange={(v) => v && setG("origemCi", v)}>
              <SelectTrigger id="h04-origem" aria-label="Origem do coeficiente de infiltração"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ORIGENS_CI) as (keyof typeof ORIGENS_CI)[]).map((k) => (
                  <SelectItem key={k} value={k}>{ORIGENS_CI[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!porPercolacao && (
            <div className="space-y-1.5">
              <Label htmlFor="h04-ci">Coeficiente (L/m²·dia)</Label>
              <Input id="h04-ci" aria-invalid={invalidos.has("h04-ci") || undefined} type="number" value={g.ciInformado} onChange={(e) => setG("ciInformado", e.target.value)} className="font-mono" />
            </div>
          )}
        </div>
        {porPercolacao && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">Furos do teste de percolação</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={furos.length >= MAX_FUROS_LISTA}
                onClick={() => setFuros((a) => [...a, novoFuro()])}
              >
                <Plus aria-hidden className="h-3.5 w-3.5 mr-1.5" /> Adicionar furo
              </Button>
              {furos.length >= MAX_FUROS_LISTA && <span className="text-xs text-muted-foreground">{MOTIVO_LISTA_CHEIA_FUROS}</span>}
            </div>
            <ul className="space-y-2" aria-label="Furos do teste de percolação">
              {furos.map((f, i) => {
                const itens = itensDeFuro({ total: furos.length });
                const id = `h04-furo-${i + 1}`;
                return (
                  <li key={f.chave}>
                    <LinhaComMenu itens={itens} onSelect={(item) => void executar(f.chave, item)} render={<div className="group rounded-md border bg-background p-3" />}>
                      <div className="flex items-end gap-2">
                        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label htmlFor={`${id}-tempo`} className="text-xs">Furo {i + 1}: tempo (min)</Label>
                            <Input id={`${id}-tempo`} aria-invalid={invalidos.has(`${id}-tempo`) || undefined} type="number" value={f.tempoMin} onChange={(e) => setFuro(f.chave, "tempoMin", e.target.value)} className="font-mono" />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`${id}-rebaixamento`} className="text-xs">Rebaixamento (cm)</Label>
                            <Input id={`${id}-rebaixamento`} aria-invalid={invalidos.has(`${id}-rebaixamento`) || undefined} type="number" step="0.1" value={f.rebaixamentoCm} onChange={(e) => setFuro(f.chave, "rebaixamentoCm", e.target.value)} className="font-mono" />
                          </div>
                        </div>
                        <BotaoAcoes itens={itens} onSelect={(item) => void executar(f.chave, item)} rotulo={`Ações do furo ${i + 1}`} />
                      </div>
                    </LinhaComMenu>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Tempo que o nível d&apos;água levou para baixar o rebaixamento medido. Para sumidouro vale o furo mais lento (menor coeficiente).
              Clique com o botão direito num furo (no toque, use o ⋯) para duplicar ou remover.
            </p>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">3. Sumidouro e sondagem</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="h04-diam">Diâmetro (m)</Label>
            <Input id="h04-diam" aria-invalid={invalidos.has("h04-diam") || undefined} type="number" step="0.1" value={g.diametro} onChange={(e) => setG("diametro", e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h04-un">Unidades</Label>
            <Input id="h04-un" aria-invalid={invalidos.has("h04-un") || undefined} type="number" min={1} value={g.unidades} onChange={(e) => setG("unidades", e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h04-topo">Profundidade do topo (m)</Label>
            <Input id="h04-topo" aria-invalid={invalidos.has("h04-topo") || undefined} type="number" step="0.1" value={g.topo} onChange={(e) => setG("topo", e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h04-na">Nível d&apos;água na sondagem (m, opcional)</Label>
            <Input id="h04-na" aria-invalid={invalidos.has("h04-na") || undefined} type="number" step="0.1" value={g.nivelAgua} onChange={(e) => setG("nivelAgua", e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h04-dist">Distância mínima ao lençol (m)</Label>
            <Input id="h04-dist" aria-invalid={invalidos.has("h04-dist") || undefined} type="number" step="0.1" value={g.distanciaMinima} onChange={(e) => setG("distanciaMinima", e.target.value)} className="font-mono" />
          </div>
          <div className="flex items-center gap-2 self-end pb-2">
            <Switch id="h04-fundo" checked={g.fundo} onCheckedChange={(v) => setG("fundo", v)} />
            <Label htmlFor="h04-fundo">Contar a área do fundo</Label>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Nível d&apos;água: profundidade medida no furo de sondagem. A distância mínima padrão de 1,5 m vem das normas antigas: confirme na NBR 17076:2024.
          Por padrão só a parede lateral conta como área de infiltração.
        </p>
      </section>

      {!resultado && orientacao && (
        <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{orientacao}</p>
      )}

      {resultado && (
        <div aria-live="polite" className="rounded-lg border bg-muted/40 p-4 space-y-3 text-sm">
          {resultado.furos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Coeficiente de infiltração por furo</caption>
                <thead>
                  <tr className="text-xs text-muted-foreground text-left">
                    <th scope="col" className="font-medium pb-1 pr-3">Furo</th>
                    <th scope="col" className="font-medium pb-1 pr-3 text-right">t (min/cm)</th>
                    <th scope="col" className="font-medium pb-1 pr-3 text-right">Taxa (min/m)</th>
                    <th scope="col" className="font-medium pb-1 text-right">Ci (L/m²·dia)</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {resultado.furos.map((f, i) => (
                    <tr key={i}>
                      <td className="pr-3 font-sans">{i + 1}</td>
                      <td className="pr-3 text-right">{fmtNum(f.minPorCm, 2)}</td>
                      <td className="pr-3 text-right">{fmtNum(f.minPorM, 0)}</td>
                      <td className="text-right">{fmtNum(f.ci, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 border-t pt-3">
            <Prop simbolo="V" valor={fmtNum(resultado.volumeDiarioL, 0)} un="L/dia" />
            <Prop simbolo="Ci adotado" valor={fmtNum(resultado.ciAdotado, 1)} un="L/m²·dia" />
            <Prop simbolo="A" valor={fmtNum(resultado.areaNecessariaM2, 2)} un="m²" destaque />
            <Prop simbolo="A por unidade" valor={fmtNum(resultado.areaPorUnidadeM2, 2)} un="m²" />
            <Prop simbolo="H útil" valor={fmtNum(resultado.profundidadeUtilM, 2)} un="m" destaque />
            <Prop simbolo="Fundo a" valor={fmtNum(resultado.profundidadeFundoM, 2)} un="m" />
          </div>
          {resultado.limite && (
            <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 border-t pt-3">
              <Prop simbolo="H máx. no lençol" valor={fmtNum(resultado.limite.profundidadeMaximaM, 2)} un="m" />
              <Prop simbolo="Folga" valor={fmtNum(resultado.limite.folgaM, 2)} un="m" />
              <Prop simbolo="Lençol" valor={resultado.limite.cabe ? "respeitado" : "não respeitado"} un="" destaque tom={resultado.limite.cabe ? "ok" : "alerta"} />
            </div>
          )}
          {resultado.alertas.map((a) => (
            <AlertaCalculo key={a}>{a}</AlertaCalculo>
          ))}
        </div>
      )}

      <Footer
        ferramenta="esgoto-infiltracao"
        titulo={`Destino final do esgoto — ${resultado ? `${fmtNum(resultado.areaNecessariaM2, 1)} m²` : "—"}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setFuros(furosIniciais(n));
          setGeral(geralInicial(n));
        }}
        onSalvo={onSalvo}
      />
    </div>
  );
}
