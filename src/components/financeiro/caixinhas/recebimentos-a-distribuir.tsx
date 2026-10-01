"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brlC } from "@/components/financeiro/planejador/formato";
import { Valor } from "@/components/financeiro/valor";
import { definirDistribuirDesde, distribuirRecebimentoAction, pularRecebimentoAction } from "@/modules/financeiro/distribuicao/actions";
import { bpDoTexto, bpParaTexto, motivoDaDivisao, ratear, regraSugerida, somaBp, BP_TOTAL, type ItemDeRegra } from "@/modules/financeiro/distribuicao/calculo";
import type { RecebimentoDto, RegraDto } from "@/modules/financeiro/distribuicao/queries";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import { cn } from "@/lib/utils";

const SEM_REGRA = "__sem_regra";

type Linha = { chave: string; caixinhaId: string | null; nome: string; texto: string };

/** "Recebimentos a distribuir" (mock "Caixinhas"): a regra SUGERE; nada é separado antes de confirmar. */
export function RecebimentosADistribuir({
  recebimentos,
  regras,
  nomesDeCaixinha,
  distribuirDesde,
  podeGerir,
  hoje,
}: {
  recebimentos: RecebimentoDto[];
  regras: RegraDto[];
  /** Caixinhas ATIVAS (id → nome): destinos arquivados saem da divisão. */
  nomesDeCaixinha: Record<string, string>;
  distribuirDesde: string | null;
  podeGerir: boolean;
  hoje: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState<string | null>(recebimentos[0]?.id ?? null);
  const [regraId, setRegraId] = useState<string>(SEM_REGRA);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [desde, setDesde] = useState(distribuirDesde ?? "");
  const [pendente, iniciar] = useTransition();

  const ativas = useMemo(() => regras.filter((r) => r.ativa), [regras]);
  const atual = recebimentos.find((r) => r.id === aberto) ?? recebimentos[0] ?? null;

  // Ao abrir um recebimento (ou quando a lista muda), carrega a regra sugerida para a categoria dele.
  useEffect(() => {
    if (!atual) {
      setAberto(null);
      return;
    }
    if (aberto !== atual.id) setAberto(atual.id);
    const sugerida = regraSugerida(ativas, atual.categoriaId);
    setRegraId(sugerida?.id ?? SEM_REGRA);
    // Só ao trocar de recebimento: mexer na regra depois não deve ser desfeito por um novo efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual?.id]);

  useEffect(() => {
    const r = ativas.find((x) => x.id === regraId);
    setLinhas(
      r
        ? r.itens
            // Caixinha arquivada sai da divisão; o que sobra tem de fechar 100% de novo (a pessoa ajusta).
            .filter((i) => i.caixinhaId === null || nomesDeCaixinha[i.caixinhaId])
            .map((i) => ({ chave: i.caixinhaId ?? "livre", caixinhaId: i.caixinhaId, nome: i.caixinhaId ? nomesDeCaixinha[i.caixinhaId] : "Operacional (livre)", texto: bpParaTexto(i.bp).replace("%", "") }))
        : [],
    );
  }, [regraId, ativas, nomesDeCaixinha]);

  const itens: ItemDeRegra[] = linhas.map((l) => ({ caixinhaId: l.caixinhaId, bp: bpDoTexto(l.texto) ?? 0 }));
  const motivo = linhas.length === 0 ? "Escolha uma regra." : motivoDaDivisao(itens);
  const partes = atual && !motivo ? ratear(atual.valor, itens) : [];
  const soma = somaBp(itens);

  function distribuir() {
    if (!atual || motivo) return;
    iniciar(async () => {
      const r = await distribuirRecebimentoAction({ lancamentoId: atual.id, regraId: regraId === SEM_REGRA ? null : regraId, itens });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.data.reservado > 0 ? `${brlC(r.data.reservado)} reservados nas caixinhas.` : "Nada reservado: a divisão deixou tudo livre.");
      router.refresh();
    });
  }

  function pular() {
    if (!atual) return;
    iniciar(async () => {
      const r = await pularRecebimentoAction({ lancamentoId: atual.id });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Recebimento pulado: não aparece mais aqui.");
      router.refresh();
    });
  }

  function salvarDesde() {
    iniciar(async () => {
      const r = await definirDistribuirDesde({ data: desde || null });
      if (!r.ok) return void toast.error(r.error);
      toast.success(desde ? "Data inicial salva." : "Data inicial removida.");
      router.refresh();
    });
  }

  return (
    <aside aria-labelledby="dist-t" className="flex flex-col gap-3 rounded-sm border border-l-[3px] border-l-primary bg-card p-4 shadow-[var(--card-shadow)] xl:sticky xl:top-20">
      <div className="flex items-center justify-between gap-2">
        <h2 id="dist-t" className="text-[15px] font-bold">
          Recebimentos a distribuir
        </h2>
        <span className="rounded-sm border px-1.5 py-0.5 text-xs font-medium">{recebimentos.length}</span>
      </div>

      {!distribuirDesde ? (
        <div className="flex flex-col gap-2 text-[13px]">
          <p>Escolha a partir de que data os recebimentos entram nesta lista. Assim ela não abre com todo o histórico.</p>
          {podeGerir ? (
            <div className="flex items-end gap-2">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="dd-desde">Recebidos desde</Label>
                <Input id="dd-desde" type="date" max={hoje} value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <Button size="sm" disabled={pendente || !desde} onClick={salvarDesde}>
                Salvar
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">Quem gere o Financeiro define essa data.</p>
          )}
        </div>
      ) : recebimentos.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nenhum recebimento a distribuir desde {diaMes(distribuirDesde)}/{distribuirDesde.slice(0, 4)}. Receitas recebidas aparecem aqui.
        </p>
      ) : (
        <>
          {atual && (
            <div className="flex flex-col gap-2.5 rounded-sm border border-primary p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{atual.cliente ?? atual.descricao}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    Recebido em {diaMes(atual.dataConfirmacao)}
                    {atual.conta ? ` no ${atual.conta}` : ""} · {atual.categoriaNome}
                  </p>
                </div>
                <Valor valor={atual.valor / 100} className="shrink-0 whitespace-nowrap font-semibold" />
              </div>

              {ativas.length === 0 ? (
                <p className="text-[13px]">Crie uma regra em “Regras de distribuição” para sugerir a divisão.</p>
              ) : (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="regra-sel">Regra sugerida</Label>
                    <Select value={regraId} onValueChange={(v) => setRegraId(v ?? SEM_REGRA)} items={{ [SEM_REGRA]: "Escolha uma regra", ...Object.fromEntries(ativas.map((r) => [r.id, r.nome])) }}>
                      <SelectTrigger id="regra-sel" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_REGRA}>Escolha uma regra</SelectItem>
                        {ativas.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.nome}
                            {r.padrao ? " (padrão)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {linhas.length > 0 && (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1 font-medium">Destino</th>
                          <th className="py-1 text-right font-medium">%</th>
                          <th className="py-1 text-right font-medium">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map((l, i) => {
                          const parte = partes.find((p) => p.caixinhaId === l.caixinhaId);
                          return (
                            <tr key={l.chave} className="border-t">
                              <td className="py-1 pr-2">{l.nome}</td>
                              <td className="py-1 text-right">
                                <label className="sr-only" htmlFor={`pct-${l.chave}`}>
                                  Percentual para {l.nome}
                                </label>
                                <Input
                                  id={`pct-${l.chave}`}
                                  inputMode="decimal"
                                  value={l.texto}
                                  className="ml-auto h-8 w-14 text-right font-mono"
                                  onChange={(e) => setLinhas((ls) => ls.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)))}
                                />
                              </td>
                              <td className="whitespace-nowrap py-1 pl-2 text-right font-mono">{parte ? brlC(parte.valor) : "—"}</td>
                            </tr>
                          );
                        })}
                        <tr className="border-t font-bold">
                          <td className="py-1">Total</td>
                          <td className={cn("py-1 text-right font-mono", soma === BP_TOTAL ? "text-success" : "text-destructive")}>{bpParaTexto(soma)}</td>
                          <td className="whitespace-nowrap py-1 text-right font-mono">{brlC(atual.valor)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                  {motivo && linhas.length > 0 && (
                    <p role="alert" className="text-[12.5px] font-medium text-destructive">
                      {motivo}
                    </p>
                  )}
                  <p className="rounded-sm border bg-muted/30 px-2.5 py-1.5 text-[12.5px]">“Operacional” fica livre: não entra em caixinha nenhuma.</p>
                </>
              )}

              {podeGerir ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={pendente || !!motivo} onClick={distribuir}>
                    Confirmar distribuição
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pendente} onClick={pular}>
                    Pular
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Quem gere o Financeiro confirma a distribuição.</p>
              )}
            </div>
          )}

          {recebimentos
            .filter((r) => r.id !== atual?.id)
            .map((r) => (
              <button key={r.id} type="button" onClick={() => setAberto(r.id)} className="flex items-center justify-between gap-2 rounded-sm px-1 py-1.5 text-left text-[13.5px] hover:bg-muted/40">
                <span className="min-w-0">
                  <b className="block truncate">{r.cliente ?? r.descricao}</b>
                  <span className="block text-[12.5px] text-muted-foreground">
                    Recebido em {diaMes(r.dataConfirmacao)}
                    {r.conta ? ` no ${r.conta}` : ""}
                  </span>
                </span>
                <Valor valor={r.valor / 100} className="shrink-0 whitespace-nowrap" />
              </button>
            ))}
          <p className="text-[12.5px] text-muted-foreground">A regra só sugere. Nada é separado antes de você confirmar.</p>
        </>
      )}
    </aside>
  );
}
