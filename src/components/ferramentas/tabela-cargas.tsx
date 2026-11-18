"use client";

import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import type { LinhaDemanda, ResultadoDemanda } from "@/modules/ferramentas/calc/electrical-demand";
import { camposInvalidos, type Linha } from "@/modules/ferramentas/carga-linha";
import { cn } from "@/lib/utils";
import { LinhaCarga } from "./linha-carga";
import { Segmentado } from "./segmentado";

/** Número com casas fixas e separador de milhar (pt-BR), para as colunas alinharem. `null` = "—". */
export function fmtTela(n: number | null | undefined, casas: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

const LIGACOES_CURTAS = [
  { valor: "mono", rotulo: "Mono", titulo: "Monofásica" },
  { valor: "tri", rotulo: "Tri", titulo: "Trifásica" },
] as const;

/**
 * Larguras fixas das colunas curtas; a descrição fica com o resto. Com o menu aberto a 1366 px a tabela
 * cabe; abaixo disso ela rola dentro do card (e, no celular, vira um card por carga).
 */
const LARGURAS = [36, null, 52, 76, 62, 96, 54, 54, 56, 80, 64, 64, 84, 36] as const;

type Props = {
  linhas: Linha[];
  /** Resultado de cada linha completa (`linhasCalculadas`), na mesma ordem. */
  porLinha: (LinhaDemanda | null)[];
  /** Resultado do cálculo inteiro, para a linha de total. `null` enquanto falta algo. */
  resultado: ResultadoDemanda | null;
  itensDe: (indice: number) => AcaoItem[];
  onAcao: (chave: number, item: AcaoItemAcao) => void;
  onChange: (chave: number, k: keyof Linha, v: string) => void;
  /** Prefixo dos ids da tabela; os cards do celular usam `${idPrefixo}m`. */
  idPrefixo: string;
};

/**
 * As cargas da calculadora "Corrente e demanda": uma tabela de largura total a partir de `md` (os campos
 * em linha, o calculado em cinza na mesma linha, total no rodapé) e um card por carga no celular.
 * Cada título de coluna tem duas linhas fixas (nome e unidade), alinhadas pelo topo.
 */
export function TabelaCargas({ linhas, porLinha, resultado, itensDe, onAcao, onChange, idPrefixo }: Props) {
  const qtdTotal = resultado ? resultado.linhas.reduce((s, l) => s + l.quantidade, 0) : null;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[58rem] table-fixed border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Cargas da instalação, com a corrente e a demanda de cada uma</caption>
          <colgroup>
            {LARGURAS.map((w, i) => (
              <col key={i} style={w ? { width: w } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <td />
              <Grupo colSpan={8}>Dados da carga</Grupo>
              <Grupo colSpan={4} calculado>
                Calculado
              </Grupo>
              <td />
            </tr>
            <tr>
              <Cab nome={<span className="sr-only">Ordem</span>} visivel="#" />
              <Cab nome="Descrição" esquerda />
              <Cab nome="Qtd" un="un" />
              <Cab nome="P unit." un="W" />
              <Cab nome="Tensão" un="V" />
              <Cab nome="Ligação" />
              <Cab nome="FP" un="0 a 1" dica="Fator de potência da carga, de 0 a 1." />
              <Cab nome="η" un="0 a 1" simbolo dica="Rendimento. Motores: o da placa. Cargas resistivas e iluminação: 1." />
              <Cab nome="FD" un="%" dica="Fator de demanda da concessionária. 100 % se a carga funciona toda junta." />
              <Cab nome="P abs." un="W" calculado inicio dica="Potência absorvida = qtd × P ÷ η" />
              <Cab nome="Ib" un="A" calculado simbolo dica="Corrente de projeto = P abs ÷ (k · V · FP), com k = 1 (mono) ou √3 (tri)" />
              <Cab nome="Ib′" un="A" calculado simbolo dica="Corrente corrigida = Ib ÷ (FCT × FCA). Compare com a capacidade de condução do cabo." />
              <Cab nome="Demanda" un="W" calculado dica="Demanda = P abs × FD" />
              <Cab nome={<span className="sr-only">Ações</span>} />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <LinhaTabela
                key={l.chave}
                linha={l}
                numero={i + 1}
                calculo={porLinha[i] ?? null}
                itens={itensDe(i)}
                idPrefixo={idPrefixo}
                onAcao={(item) => onAcao(l.chave, item)}
                onChange={(k, v) => onChange(l.chave, k, v)}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className={RODAPE} />
              <td className={cn(RODAPE, "pl-2 text-left")}>Total</td>
              <td className={cn(RODAPE, NUMERO)}>{fmtTela(qtdTotal, 0)}</td>
              <td className={RODAPE} colSpan={6} />
              <td className={cn(RODAPE, NUMERO, CALC_RODAPE, "border-l")}>{fmtTela(resultado?.pInstaladaW, 0)}</td>
              <td className={cn(RODAPE, NUMERO, CALC_RODAPE, "text-muted-foreground")}>—</td>
              <td className={cn(RODAPE, NUMERO, CALC_RODAPE, "text-muted-foreground")}>—</td>
              <td className={cn(RODAPE, NUMERO, CALC_RODAPE, "font-bold")}>{fmtTela(resultado?.pDemandadaW, 0)}</td>
              <td className={RODAPE} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Celular: um card por carga (o mesmo componente do Estudos), com o calculado embaixo. */}
      <ul className="space-y-2 p-3 md:hidden" aria-label="Cargas da instalação">
        {linhas.map((l, i) => {
          const c = porLinha[i];
          return (
            <li key={l.chave}>
              <LinhaCarga
                linha={l}
                numero={i + 1}
                itens={itensDe(i)}
                idPrefixo={`${idPrefixo}m`}
                onSelect={(item) => onAcao(l.chave, item)}
                onChange={(k, v) => onChange(l.chave, k, v)}
                extra={
                  <p className="col-span-2 rounded-sm bg-muted/40 px-2 py-1.5 font-mono text-xs tabular-nums sm:col-span-4">
                    {c ? `Ib′ ${fmtTela(c.ibCorrigida, 2)} A · Demanda ${fmtTela(c.pDemandada, 0)} W` : "Complete a carga para calcular"}
                  </p>
                }
              />
            </li>
          );
        })}
        <li className="flex flex-wrap justify-between gap-x-4 gap-y-1 rounded-sm border bg-muted/45 px-3 py-2 text-sm font-semibold">
          <span>Total</span>
          <span className="font-mono tabular-nums">
            {fmtTela(resultado?.pInstaladaW, 0)} W instalados · {fmtTela(resultado?.pDemandadaW, 0)} W de demanda
          </span>
        </li>
      </ul>
    </>
  );
}

const CELULA = "border-b border-border/60 px-1 py-1.5 align-middle";
const NUMERO = "text-center font-mono tabular-nums";
const CALC = "bg-muted/40";
const RODAPE = "border-t-2 border-border bg-muted/45 px-1 py-2";
const CALC_RODAPE = "bg-muted/60";
/** Campo numérico da tabela: estreito, centrado, sem as setas do navegador; o que falta fica âmbar (não vermelho). */
const CAMPO_NUMERO = cn(
  "h-8 rounded-sm px-1 text-center font-mono tabular-nums",
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
  "aria-invalid:border-warning aria-invalid:bg-warning/10 aria-invalid:ring-0 dark:aria-invalid:border-warning",
  "aria-invalid:placeholder:font-semibold aria-invalid:placeholder:text-warning-text",
);

function Grupo({ colSpan, calculado, children }: { colSpan: number; calculado?: boolean; children: ReactNode }) {
  return (
    <th scope="colgroup" colSpan={colSpan} className="px-1 pt-3.5 pb-1.5 text-left">
      <span
        className={cn(
          "block border-b-2 pb-1 font-mono text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase",
          calculado ? "border-muted-foreground/60" : "border-border",
        )}
      >
        {children}
      </span>
    </th>
  );
}

/** Título de coluna: nome em cima e unidade embaixo (linha vazia quando não há), sempre na mesma altura. */
function Cab({
  nome,
  visivel,
  un,
  dica,
  esquerda,
  calculado,
  inicio,
  simbolo,
}: {
  nome: ReactNode;
  /** Texto à vista quando `nome` é só para leitor de tela (ex.: "#"). */
  visivel?: string;
  un?: string;
  dica?: string;
  esquerda?: boolean;
  calculado?: boolean;
  /** Primeira coluna do calculado: ganha a borda que separa os grupos. */
  inicio?: boolean;
  /** Símbolo (η, Ib): sem caixa alta, que trocaria η por Η e Ib por IB. */
  simbolo?: boolean;
}) {
  const rotulo = (
    <span className={cn(simbolo && "text-xs tracking-normal normal-case")}>
      {nome}
      {visivel && <span aria-hidden>{visivel}</span>}
    </span>
  );
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-border bg-muted/45 px-1 pt-2 pb-1.5 text-center align-top font-mono text-[10px] leading-[13px] font-bold tracking-[0.08em] text-muted-foreground uppercase",
        esquerda && "pl-2 text-left",
        calculado && "bg-muted/70",
        inicio && "border-l",
      )}
    >
      {dica ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="cursor-help uppercase underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              />
            }
          >
            {rotulo}
          </TooltipTrigger>
          <TooltipContent>{dica}</TooltipContent>
        </Tooltip>
      ) : (
        rotulo
      )}
      <span className="block font-medium tracking-[0.02em] normal-case" aria-hidden={!un}>
        {un ?? " "}
      </span>
    </th>
  );
}

/** Uma carga na tabela. Componente de topo (não definido dentro da tabela): remontar fecharia o menu aberto. */
function LinhaTabela({
  linha,
  numero,
  calculo,
  itens,
  idPrefixo,
  onAcao,
  onChange,
}: {
  linha: Linha;
  numero: number;
  calculo: LinhaDemanda | null;
  itens: AcaoItem[];
  idPrefixo: string;
  onAcao: (item: AcaoItemAcao) => void;
  onChange: (k: keyof Linha, v: string) => void;
}) {
  const id = `${idPrefixo}-${numero}`;
  const invalidos = camposInvalidos(linha);
  const campo = (k: keyof Linha, rotulo: string, step?: string) => {
    const invalido = invalidos.has(k);
    return (
      <td className={CELULA}>
        <Input
          id={`${id}-${k}`}
          type="number"
          step={step}
          value={linha[k] as string}
          aria-label={`${rotulo} da carga ${numero}`}
          aria-invalid={invalido || undefined}
          placeholder={invalido && !(linha[k] as string).trim() ? "digite" : undefined}
          onChange={(e) => onChange(k, e.target.value)}
          className={CAMPO_NUMERO}
        />
      </td>
    );
  };
  const saida = (valor: string, extra?: string) => (
    <td className={cn(CELULA, NUMERO, CALC, !calculo && "text-muted-foreground", extra)}>{calculo ? valor : "—"}</td>
  );

  return (
    <LinhaComMenu itens={itens} onSelect={onAcao} render={<tr className="group hover:bg-muted/25 data-[popup-open]:bg-muted/40" />}>
      <td className={cn(CELULA, "pr-2 text-right font-mono text-xs text-muted-foreground")}>{numero}</td>
      <td className={CELULA}>
        <Input
          id={`${id}-descricao`}
          value={linha.descricao}
          maxLength={120}
          aria-label={`Descrição da carga ${numero}`}
          placeholder="Ex.: chuveiro do vestiário"
          onChange={(e) => onChange("descricao", e.target.value)}
          className="h-8 rounded-sm"
        />
      </td>
      {campo("quantidade", "Quantidade")}
      {campo("potenciaW", "Potência unitária (W)")}
      {campo("tensaoV", "Tensão (V)")}
      <td className={CELULA}>
        <Segmentado
          opcoes={LIGACOES_CURTAS}
          valor={linha.ligacao}
          onChange={(v) => onChange("ligacao", v)}
          rotulo={`Ligação da carga ${numero}`}
        />
      </td>
      {campo("fp", "Fator de potência", "0.01")}
      {campo("rendimento", "Rendimento", "0.01")}
      {campo("fdPct", "Fator de demanda (%)")}
      {saida(fmtTela(calculo?.pInstalada, 0), "border-l")}
      {saida(fmtTela(calculo?.ib, 2))}
      {saida(fmtTela(calculo?.ibCorrigida, 2))}
      {saida(fmtTela(calculo?.pDemandada, 0), "font-semibold")}
      <td className={cn(CELULA, "text-center")}>
        <BotaoAcoes itens={itens} onSelect={onAcao} rotulo={`Ações da carga ${numero}`} className="size-7" />
      </td>
    </LinhaComMenu>
  );
}
