"use client";

import { useMemo, useState } from "react";
import { ZodError } from "zod";
import { BookOpen, CircleCheck, Gauge, Plus, PlugZap, Save, Sigma, Thermometer, Zap } from "lucide-react";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { calcular } from "@/modules/ferramentas/calc/electrical-demand";
import {
  ACAO_ARQUIVO_EXPORTAR,
  ACAO_ARQUIVO_IMPORTAR,
  ACAO_CARGA_DESCER,
  ACAO_CARGA_DUPLICAR,
  ACAO_CARGA_REMOVER,
  ACAO_CARGA_SUBIR,
  MAX_CARGAS,
  MOTIVO_LISTA_CHEIA,
  itensDeCarga,
  itensDoArquivo,
  moverItem,
} from "@/modules/ferramentas/acoes-carga";
import {
  fatoresDaTela,
  geralInicial,
  linhasCalculadas,
  linhasIniciais,
  montarEntrada,
  novaLinha,
  num,
  pendenciasDaEntrada,
  type Geral,
  type Linha,
  type Pendencia,
} from "@/modules/ferramentas/carga-linha";
import { getGuia } from "@/modules/ferramentas/guia-meta";
import { getFerramenta, situacaoValidacao, versaoCalcDe } from "@/modules/ferramentas/registry";
import type { FormatoExport, RecenteCalculo } from "@/modules/ferramentas/types";
import { AvisoValidacao } from "./aviso-validacao";
import { CabecalhoCartao, CartaoAlimentacao, CartaoCondicoes } from "./cartoes-condicoes";
import { GuiaPainel } from "./guia/guia-ferramenta";
import { RecentesList } from "./recentes-list";
import { SalvarDialog } from "./salvar-dialog";
import { useSavefile } from "./savefile-buttons";
import { TabelaCargas, fmtTela } from "./tabela-cargas";

const FERRAMENTA = "corrente-demanda";
/** Prefixo dos ids dos campos (a tabela; os cards do celular usam `${ID}m`). */
const ID = "e01";
/** Campo das condições → id do campo na tela (para "Ir para o campo"). */
const ID_DO_CAMPO_GERAL: Partial<Record<keyof Geral, string>> = {
  circuitos: `${ID}-circ`,
  alimentacaoTensaoV: `${ID}-vali`,
  fctManual: `${ID}-fct`,
  fcaManual: `${ID}-fca`,
};

type RecenteSerializado = Omit<RecenteCalculo, "createdAt"> & { createdAt: string };

type Props = {
  initialEntradas?: Record<string, unknown>;
  onSalvo: (id: string) => void;
  recentes: RecenteSerializado[];
  onAbrir: (id: string) => void;
  exportaveis: FormatoExport[];
};

/** Leva o foco ao campo do que falta: o da tabela ou, no celular, o do card (o que estiver visível). */
function focarPendencia(p: Pendencia) {
  const ids =
    p.carga != null
      ? [`${ID}-${p.carga + 1}-${p.campo}`, `${ID}m-${p.carga + 1}-${p.campo}`]
      : [ID_DO_CAMPO_GERAL[p.campo as keyof Geral]].filter((x): x is string => !!x);
  const el = ids.map((id) => document.getElementById(id)).find((e) => e && e.offsetParent !== null);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus({ preventScroll: true });
}

/** Valor de indicador: número mono com a unidade menor ao lado, ou "—". */
function ValorKpi({ valor, un }: { valor: string; un: string }) {
  if (valor === "—") return <span className="font-mono text-muted-foreground">—</span>;
  return (
    <span className="font-mono tabular-nums">
      {valor}
      {un && <span className="ml-1 text-sm font-semibold text-muted-foreground">{un}</span>}
    </span>
  );
}

/**
 * Tela larga da calculadora "Corrente e demanda": usa a largura toda, com o resultado no topo (como os
 * indicadores da Visão Geral do projeto), as cargas numa tabela, condições/alimentação/avisos lado a lado e
 * os recentes por último. O guia sai da coluna fixa e vai para a gaveta "Como preencher".
 */
export function CorrenteDemandaView({ initialEntradas, onSalvo, recentes, onAbrir, exportaveis }: Props) {
  const confirm = useConfirm();
  const meta = getFerramenta(FERRAMENTA);
  const guia = getGuia(FERRAMENTA);
  const [linhas, setLinhas] = useState<Linha[]>(() => linhasIniciais(initialEntradas));
  const [geral, setGeral] = useState<Geral>(() => geralInicial(initialEntradas));
  const [salvarOpen, setSalvarOpen] = useState(false);
  const [guiaAberto, setGuiaAberto] = useState(false);

  const montagem = useMemo(() => montarEntrada(linhas, geral), [linhas, geral]);
  const entrada = montagem.entrada ?? null;
  const { resultado, erroCalculo } = useMemo(() => {
    if (!entrada) return { resultado: null, erroCalculo: null };
    try {
      return { resultado: calcular(entrada), erroCalculo: null };
    } catch (e) {
      const msg = e instanceof ZodError ? e.issues[0]?.message : null;
      return { resultado: null, erroCalculo: msg ?? "Não foi possível calcular com estes dados." };
    }
  }, [entrada]);
  const porLinha = useMemo(() => linhasCalculadas(linhas, geral), [linhas, geral]);
  const pendencias = useMemo(() => pendenciasDaEntrada(linhas, geral), [linhas, geral]);
  const fatores = useMemo(() => fatoresDaTela(geral), [geral]);

  const total = linhas.length;
  const titulo = `Corrente e demanda — ${total} carga${total > 1 ? "s" : ""}`;
  const entradasArquivo = (entrada ?? {}) as Record<string, unknown>;
  const { exportar, importar, campoArquivo } = useSavefile({
    ferramenta: FERRAMENTA,
    versaoCalc: versaoCalcDe(FERRAMENTA),
    titulo,
    entradas: entradasArquivo,
    onImport: (n) => {
      setLinhas(linhasIniciais(n));
      setGeral(geralInicial(n));
    },
  });

  const setLinha = (chave: number, k: keyof Linha, v: string) =>
    setLinhas((a) => a.map((l) => (l.chave === chave ? { ...l, [k]: v } : l)));

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
    const nova = novaLinha();
    // A linha é achada pela chave DEPOIS da confirmação: a lista pode ter mudado com o diálogo aberto.
    setLinhas((a) => {
      const indice = a.findIndex((l) => l.chave === chave);
      if (indice < 0) return a;
      if (item.id === ACAO_CARGA_DUPLICAR) {
        const copia = { ...a[indice], chave: nova.chave, descricao: a[indice].descricao ? `${a[indice].descricao.slice(0, 112)} (cópia)` : "" };
        return [...a.slice(0, indice + 1), copia, ...a.slice(indice + 1)];
      }
      if (item.id === ACAO_CARGA_SUBIR) return moverItem(a, indice, indice - 1);
      if (item.id === ACAO_CARGA_DESCER) return moverItem(a, indice, indice + 1);
      if (item.id === ACAO_CARGA_REMOVER) return a.length > 1 ? a.filter((l) => l.chave !== chave) : a;
      return a;
    });
  }

  function adicionarCarga() {
    const nova = novaLinha();
    setLinhas((a) => (a.length >= MAX_CARGAS ? a : [...a, nova]));
    // O campo só existe depois do próximo desenho.
    requestAnimationFrame(() => {
      const el = [`${ID}-${total + 1}-descricao`, `${ID}m-${total + 1}-descricao`]
        .map((id) => document.getElementById(id))
        .find((e) => e && e.offsetParent !== null);
      el?.focus();
    });
  }

  if (!meta || !guia) return null;
  const grupo = (n: number) => guia.grupos.find((g) => g.n === n)?.titulo ?? "";
  const emValidacao = situacaoValidacao(meta) === "em_validacao";
  const chips = (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline">{meta.disciplina}</Badge>
      {meta.norma && <Badge variant="secondary">{meta.norma}</Badge>}
    </div>
  );
  const semResultado = pendencias.some((p) => p.carga != null) ? "Complete as cargas marcadas" : "Veja os avisos";
  const tensaoAlimentacao = num(geral.alimentacaoTensaoV);
  const qtdEquipamentos = resultado ? resultado.linhas.reduce((s, l) => s + l.quantidade, 0) : 0;
  const fator = fatores.fct.valor != null && fatores.fca.valor != null ? fatores.fct.valor * fatores.fca.valor : null;
  const nAvisos = pendencias.length + (erroCalculo ? 1 : 0) + (resultado?.alertas.length ?? 0);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo={meta.nome}
        descricao="Corrente de projeto, corrente corrigida e demanda de cada carga."
        trilha={[
          { href: "/", label: "Início" },
          { href: "/ferramentas", label: "Ferramentas" },
          { label: meta.nome },
        ]}
        acoes={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setGuiaAberto(true)}>
              <BookOpen aria-hidden />
              Como preencher
            </Button>
            <Button type="button" size="sm" disabled={!resultado} onClick={() => setSalvarOpen(true)}>
              <Save aria-hidden />
              Salvar cálculo
            </Button>
            <BotaoAcoes
              itens={itensDoArquivo({ calculado: !!resultado })}
              onSelect={(item) => {
                if (item.id === ACAO_ARQUIVO_EXPORTAR) exportar();
                if (item.id === ACAO_ARQUIVO_IMPORTAR) importar();
              }}
              rotulo="Mais ações do cálculo"
              className="size-7 border border-input text-foreground"
            />
          </>
        }
      />
      {campoArquivo}

      {emValidacao ? <AvisoValidacao>{chips}</AvisoValidacao> : chips}

      <section aria-label="Resultado do cálculo" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Carga instalada"
          icone={PlugZap}
          valor={<ValorKpi valor={fmtTela(resultado ? resultado.pInstaladaW / 1000 : null, 2)} un="kW" />}
          detalhe={resultado ? `${total} carga${total > 1 ? "s" : ""} · ${fmtTela(qtdEquipamentos, 0)} equipamentos` : semResultado}
        />
        <KpiCard
          label="Demanda"
          icone={Sigma}
          valor={<ValorKpi valor={fmtTela(resultado ? resultado.pDemandadaW / 1000 : null, 2)} un="kW" />}
          detalhe={resultado ? `Fator de demanda global ${fmtTela(resultado.fatorDemandaGlobal * 100, 0)} %` : semResultado}
        />
        <KpiCard
          label="Demanda aparente"
          icone={Gauge}
          valor={<ValorKpi valor={fmtTela(resultado ? resultado.sDemandadaVA / 1000 : null, 2)} un="kVA" />}
          detalhe={resultado ? `FP médio ${fmtTela(resultado.fpMedio, 2)}` : semResultado}
        />
        <KpiCard
          label="Corrente total"
          icone={Zap}
          valor={<ValorKpi valor={fmtTela(resultado?.correnteTotalA, 1)} un="A" />}
          detalhe={`${geral.alimentacaoLigacao === "tri" ? "Trifásica" : "Monofásica"} · ${tensaoAlimentacao > 0 ? `${fmtTela(tensaoAlimentacao, 0)} V` : "sem tensão"}`}
        />
        <KpiCard
          label="FCT × FCA"
          icone={Thermometer}
          valor={<ValorKpi valor={fmtTela(fator, 2)} un="" />}
          detalhe={`FCT ${fmtTela(fatores.fct.valor, 2)} · FCA ${fmtTela(fatores.fca.valor, 2)}`}
          className="col-span-2 sm:col-span-1"
        />
      </section>

      <Card className="gap-0 py-0">
        <CabecalhoCartao
          n={1}
          titulo={
            <>
              {grupo(1)}
              <span className="text-xs font-normal text-muted-foreground">
                {total} carga{total > 1 ? "s" : ""}
              </span>
            </>
          }
        >
          <LegendaCampos />
        </CabecalhoCartao>
        <TabelaCargas
          linhas={linhas}
          porLinha={porLinha}
          resultado={resultado}
          itensDe={(i) => itensDeCarga({ indice: i, total })}
          onAcao={(chave, item) => void executar(chave, item)}
          onChange={setLinha}
          idPrefixo={ID}
        />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={total >= MAX_CARGAS} onClick={adicionarCarga}>
              <Plus aria-hidden />
              Adicionar carga
            </Button>
            {total >= MAX_CARGAS && <span className="text-xs text-muted-foreground">{MOTIVO_LISTA_CHEIA}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Potência nominal em W (de saída, no caso de motores). Botão direito (ou toque longo) numa carga, ou ⋯, para duplicar, mover
            ou remover.
          </p>
        </div>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
          <CartaoCondicoes geral={geral} onChange={setGeral} fatores={fatores} idPrefixo={ID} numero={2} titulo={grupo(2)} />
        </div>
        <CartaoAlimentacao
          geral={geral}
          onChange={setGeral}
          correnteTotalA={resultado?.correnteTotalA ?? null}
          idPrefixo={ID}
          numero={3}
          titulo={grupo(3)}
        />
        <Card className="gap-0 py-0">
          <CabecalhoCartao
            titulo={
              <>
                Avisos
                <span
                  aria-hidden
                  className={
                    nAvisos > 0
                      ? "rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 font-mono text-xs text-warning-text"
                      : "rounded-full bg-muted px-2 py-0.5 font-mono text-xs"
                  }
                >
                  {nAvisos}
                </span>
              </>
            }
          />
          {/* Só o resumo é anunciado: a lista inteira, viva, seria relida a cada tecla. */}
          <p className="sr-only" aria-live="polite">
            {nAvisos === 0 ? "Nenhum aviso." : `${nAvisos} ${nAvisos === 1 ? "aviso" : "avisos"}.`}
          </p>
          <div className="p-4">
            {nAvisos === 0 ? (
              <p className="flex items-start gap-2.5 rounded-sm bg-success/10 px-3 py-2.5 text-sm">
                <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success-text" />
                <span>
                  <strong className="font-semibold text-success-text">Nenhum aviso.</strong> As cargas estão completas e os fatores de
                  correção estão dentro do esperado.
                </span>
              </p>
            ) : (
              <ul className="space-y-2.5">
                {pendencias.map((p) => (
                  <li key={`${p.carga ?? "g"}-${p.campo}`} className="border-l-2 border-warning pl-2.5 text-sm">
                    {p.texto}
                    <button
                      type="button"
                      onClick={() => focarPendencia(p)}
                      aria-label={p.carga != null ? `Ir para a carga ${p.carga + 1}` : undefined}
                      className="mt-0.5 block text-xs font-semibold underline underline-offset-2 hover:text-primary"
                    >
                      {p.carga != null ? "Ir para a carga" : "Ir para o campo"}
                    </button>
                  </li>
                ))}
                {erroCalculo && <li className="border-l-2 border-destructive pl-2.5 text-sm">{erroCalculo}</li>}
                {resultado?.alertas.map((a) => (
                  <li key={a} className="border-l-2 border-warning pl-2.5 text-sm">
                    <strong className="font-semibold">Atenção:</strong> {a}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CabecalhoCartao titulo="Recentes">
          <span className="text-xs text-muted-foreground">Abrir troca os dados da tela pelos do cálculo salvo.</span>
        </CabecalhoCartao>
        <div className="p-3">
          <RecentesList recentes={recentes} onAbrir={onAbrir} exportaveis={exportaveis} />
        </div>
      </Card>

      <SalvarDialog
        open={salvarOpen}
        onOpenChange={setSalvarOpen}
        ferramenta={FERRAMENTA}
        tituloSugerido={titulo}
        entradas={entradasArquivo}
        onSalvo={onSalvo}
      />

      <Sheet open={guiaAberto} onOpenChange={setGuiaAberto}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Como preencher</SheetTitle>
            <SheetDescription>{guia.subtitulo}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <GuiaPainel slug={FERRAMENTA} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** As cores dos campos: branco = você preenche, cinza = calculado, âmbar = falta preencher. */
function LegendaCampos() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Cores dos campos">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3.5 rounded-sm border border-input bg-card" />
        Você preenche
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3.5 rounded-sm border border-border/60 bg-muted/40" />
        Calculado
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3.5 rounded-sm border border-warning bg-warning/10" />
        Falta preencher
      </li>
    </ul>
  );
}
