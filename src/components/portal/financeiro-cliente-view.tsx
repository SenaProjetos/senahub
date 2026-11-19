import { Banknote, CircleCheck } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { brl, cn, formatarData } from "@/lib/utils";
import { formatarCodigo } from "@/modules/projetos/numbering";
import {
  SITUACAO_PARCELA_LABEL,
  type FinanceiroDoCliente,
  type ParcelaDoCliente,
  type SituacaoParcela,
} from "@/modules/portal/financeiro";

const TITULO = "Financeiro";
const DESCRICAO = "Parcelas dos seus projetos: valores, vencimentos e pagamentos.";

const COR_SITUACAO: Record<SituacaoParcela, string> = {
  vencida: "text-destructive-text border-destructive/40",
  a_vencer: "text-warning-text border-warning/40",
  paga: "text-success-text border-success/40",
};

const reais = (centavos: number) => brl(centavos / 100);

function Resumo({ rotulo, centavos, cor }: { rotulo: string; centavos: number; cor?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">{rotulo}</CardDescription>
        <CardTitle className={cn("text-2xl", cor)}>{reais(centavos)}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function LinhaParcela({ p }: { p: ParcelaDoCliente }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <p className="font-medium">
          {p.projeto ? (
            <>
              <span className="font-mono text-primary">{formatarCodigo(p.projeto.codigo)}</span> · {p.projeto.nome}
            </>
          ) : (
            "Sem projeto"
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Vencimento {formatarData(p.vencimento)}
          {p.pagaEm ? ` · Pago em ${formatarData(p.pagaEm)}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono">{reais(p.valorCentavos)}</span>
        <Badge variant="outline" className={COR_SITUACAO[p.situacao]}>
          {SITUACAO_PARCELA_LABEL[p.situacao]}
        </Badge>
      </div>
    </li>
  );
}

/** Aviso no lugar da tela quando a conta não tem cliente ou o cliente está desativado (mesmas frases do portal). */
export function FinanceiroClienteIndisponivel({ semVinculo }: { semVinculo: boolean }) {
  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo={TITULO} descricao={DESCRICAO} />
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {semVinculo
            ? "Sua conta ainda não está vinculada a um cliente. Contate o escritório."
            : "O acesso deste cliente ao portal está suspenso. Fale com o escritório."}
        </CardContent>
      </Card>
    </div>
  );
}

/** Financeiro do portal do cliente: só valores e datas, somente leitura. */
export function FinanceiroClienteView({ dados }: { dados: FinanceiroDoCliente }) {
  const { emAberto, pagas, totais } = dados;
  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo={TITULO} descricao={DESCRICAO} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Resumo rotulo="Vencido" centavos={totais.vencidoCentavos} cor={totais.vencidoCentavos > 0 ? "text-destructive-text" : undefined} />
        <Resumo rotulo="A vencer" centavos={totais.aVencerCentavos} cor={totais.aVencerCentavos > 0 ? "text-warning-text" : undefined} />
        <Resumo rotulo="Pago" centavos={totais.pagoCentavos} cor="text-success-text" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Em aberto</CardTitle>
          <CardDescription>Parcelas ainda não pagas, da mais antiga para a mais nova.</CardDescription>
        </CardHeader>
        <CardContent>
          {emAberto.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nenhuma parcela em aberto." />
          ) : (
            <ul role="list" className="divide-y text-sm">
              {emAberto.map((p) => (
                <LinhaParcela key={p.id} p={p} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagas</CardTitle>
        </CardHeader>
        <CardContent>
          {pagas.length === 0 ? (
            <EmptyState icon={Banknote} title="Nenhum pagamento ainda." />
          ) : (
            <ul role="list" className="divide-y text-sm">
              {pagas.map((p) => (
                <LinhaParcela key={p.id} p={p} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
