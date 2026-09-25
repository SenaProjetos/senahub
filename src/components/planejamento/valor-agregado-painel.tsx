import { TrendingUp } from "lucide-react";
import type { ValorAgregadoProjeto } from "@/modules/planejamento/valor-agregado-service";
import { faixaDoIndice, type IndicesEvm, type ResultadoRegua } from "@/modules/planejamento/valor-agregado";
import { brl, formatarData } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const horasFmt = (h: number) => `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
const indiceFmt = (i: number) => i.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TOM: Record<ReturnType<typeof faixaDoIndice>, string> = {
  bom: "text-success",
  atencao: "text-warning",
  critico: "text-destructive",
  sem_dado: "text-muted-foreground",
};

type Linha = {
  rotulo: string;
  dica: string;
  valor: (i: IndicesEvm) => number | null;
  indice?: boolean;
  pct?: (i: IndicesEvm) => number;
};

const LINHAS: Linha[] = [
  { rotulo: "Orçamento (ONT)", dica: "Tudo o que a linha de base previa, somando as atividades.", valor: (i) => i.ont },
  {
    rotulo: "Planejado até a data (VP)",
    dica: "Quanto a linha de base previa pronto até a Data de Status — a COTA do MS Project.",
    valor: (i) => i.vp,
    pct: (i) => i.planejadoPct,
  },
  {
    rotulo: "Agregado (VA)",
    dica: "Orçamento × % concluído informado de cada atividade — a COTR do MS Project.",
    valor: (i) => i.va,
    pct: (i) => i.realizadoPct,
  },
  { rotulo: "Real (CR)", dica: "O que foi apontado no ponto até a Data de Status — a CRTR do MS Project.", valor: (i) => i.cr },
  {
    rotulo: "IDP — prazo (VA ÷ VP)",
    dica: "Abaixo de 1, o trabalho feito está atrás do que a linha de base previa para esta data.",
    valor: (i) => i.idp,
    indice: true,
  },
  {
    rotulo: "IDC — custo (VA ÷ CR)",
    dica: "Abaixo de 1, o avanço está custando mais (horas ou R$) do que o orçado.",
    valor: (i) => i.idc,
    indice: true,
  },
  {
    rotulo: "Estimativa no término (ENT)",
    dica: "Orçamento ÷ IDC: quanto o projeto vai custar se o ritmo de custo se mantiver.",
    valor: (i) => i.ent,
  },
  { rotulo: "Variação no término (VNT)", dica: "Orçamento − ENT. Negativo = vai estourar.", valor: (i) => i.vnt },
];

function celula(r: ResultadoRegua, l: Linha, fmt: (v: number) => string) {
  if (!r.ok) return <span className="text-muted-foreground">—</span>;
  const v = l.valor(r.indices);
  if (v == null) {
    return (
      <span className="text-muted-foreground" title={r.motivoRealizado ?? "Sem dado suficiente para este número."}>
        —
      </span>
    );
  }
  if (l.indice) return <span className={`font-semibold ${TOM[faixaDoIndice(v)]}`}>{indiceFmt(v)}</span>;
  return (
    <>
      {fmt(v)}
      {l.pct && <span className="ml-1 text-muted-foreground">({l.pct(r.indices).toLocaleString("pt-BR")}%)</span>}
    </>
  );
}

/**
 * Valor Agregado do projeto (F8), em horas (para quem coordena) e em R$ (para quem vê o
 * financeiro). Mesmo cálculo nas duas colunas — muda só a régua.
 */
export function ValorAgregadoPainel({ dados }: { dados: ValorAgregadoProjeto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-4" aria-hidden /> Valor Agregado
        </CardTitle>
        <CardDescription>
          {dados.ok ? (
            <>
              Apurado na Data de Status <strong>{formatarData(dados.dataStatus)}</strong>, contra a linha de base{" "}
              <span className="font-mono">BL-{String(dados.baselineNumero).padStart(2, "0")}</span>. Horas apontadas no
              projeto até lá: {horasFmt(dados.horasApontadas)}.
            </>
          ) : (
            dados.motivo
          )}
        </CardDescription>
      </CardHeader>
      {dados.ok && (
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-sm border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2 text-right">Horas</th>
                  {dados.custo && <th className="px-3 py-2 text-right">R$</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {LINHAS.map((l) => (
                  <tr key={l.rotulo}>
                    <td className="px-3 py-1.5" title={l.dica}>
                      {l.rotulo}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs">{celula(dados.horas, l, horasFmt)}</td>
                    {dados.custo && (
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs">{celula(dados.custo, l, brl)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!dados.horas.ok && <p className="text-xs text-warning">Horas: {dados.horas.motivo}</p>}
          {dados.custo && !dados.custo.ok && <p className="text-xs text-warning">R$: {dados.custo.motivo}</p>}
          {dados.custo?.ok && dados.custo.motivoRealizado && (
            <p className="text-xs text-warning">R$: {dados.custo.motivoRealizado}</p>
          )}
          {dados.avisos.map((a) => (
            <p key={a} className="text-xs text-warning">
              {a}
            </p>
          ))}
          {dados.historico.length > 1 && (
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Apurações anteriores</p>
              <div className="overflow-x-auto rounded-sm border">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5">Data de Status</th>
                      <th className="px-3 py-1.5 text-right">IDP (h)</th>
                      <th className="px-3 py-1.5 text-right">IDC (h)</th>
                      {dados.custo && <th className="px-3 py-1.5 text-right">IDP (R$)</th>}
                      {dados.custo && <th className="px-3 py-1.5 text-right">IDC (R$)</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dados.historico.map((a) => (
                      <tr key={a.dataStatus}>
                        <td className="px-3 py-1.5 font-mono">
                          {formatarData(a.dataStatus)}{" "}
                          <span className="text-muted-foreground">BL-{String(a.baselineNumero).padStart(2, "0")}</span>
                        </td>
                        {[a.idpHoras, a.idcHoras, ...(dados.custo ? [a.idpCusto, a.idcCusto] : [])].map((v, k) => (
                          <td key={k} className={`px-3 py-1.5 text-right font-mono ${TOM[faixaDoIndice(v)]}`}>
                            {v == null ? "—" : indiceFmt(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            O % é o informado na EAP (D19). O real é o apontado no ponto — quem não aponta horas (ex.: PJ pago por
            entrega) não entra; o pagamento dele está no financeiro. As datas reais ainda não movem a linha de base.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
