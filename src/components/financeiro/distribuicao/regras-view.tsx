"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Plus, Split, X } from "lucide-react";
import { toast } from "sonner";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AbasCaixinhas } from "@/components/financeiro/caixinhas/abas";
import { brlC } from "@/components/financeiro/planejador/formato";
import { cn } from "@/lib/utils";

import {
  ACAO_ATIVAR,
  ACAO_DESATIVAR,
  ACAO_DUPLICAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_PADRAO,
  itensDeRegra,
} from "@/modules/financeiro/distribuicao/acoes";
import { alternarAtivaRegra, duplicarRegra, excluirRegra, salvarRegra, tornarPadraoRegra } from "@/modules/financeiro/distribuicao/actions";
import { bpDoTexto, bpParaTexto, BP_TOTAL, motivoDaDivisao, ratear, somaBp, type ItemDeRegra } from "@/modules/financeiro/distribuicao/calculo";
import type { RegraDto } from "@/modules/financeiro/distribuicao/queries";

/** Valor de exemplo da prévia ("Em R$ 40.000"), como no mock. */
const EXEMPLO = 4_000_000;
const LIVRE = "__livre";
const NOVA = "__nova";

type Rascunho = { id: string | null; nome: string; categoriasIds: string[]; linhas: { chave: string; destino: string; texto: string }[] };

const vazio = (): Rascunho => ({ id: null, nome: "", categoriasIds: [], linhas: [] });
const daRegra = (r: RegraDto): Rascunho => ({
  id: r.id,
  nome: r.nome,
  categoriasIds: [...r.categoriasIds],
  linhas: r.itens.map((i, k) => ({ chave: `${r.id}-${k}`, destino: i.caixinhaId ?? LIVRE, texto: bpParaTexto(i.bp).replace("%", "") })),
});

/**
 * Regras de distribuição (mock "Regras de distribuição"): lista à esquerda com menu de contexto e `...`
 * (ADR-0002), editor à direita. A regra SUGERE como dividir um recebimento; "Operacional (livre)" não
 * vai para caixinha. Salvar só fica ligado quando os percentuais fecham exatamente 100%.
 */
export function RegrasView({
  regras,
  caixinhas,
  categorias,
  podeGerir,
  subnav,
}: {
  regras: RegraDto[];
  /** Caixinhas ativas: os destinos possíveis. */
  caixinhas: { id: string; nome: string }[];
  /** Categorias de receita ativas. */
  categorias: { id: string; codigo: string; nome: string }[];
  podeGerir: boolean;
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, iniciar] = useTransition();
  const [sel, setSel] = useState<string | null>(regras.find((r) => r.padrao)?.id ?? regras[0]?.id ?? null);
  const [rascunho, setRascunho] = useState<Rascunho>(() => (regras.length ? daRegra(regras.find((r) => r.padrao) ?? regras[0]) : vazio()));

  // Ao trocar a regra aberta (ou depois de salvar e recarregar), o editor volta ao que está gravado.
  useEffect(() => {
    if (sel === NOVA) return;
    const r = regras.find((x) => x.id === sel);
    setRascunho(r ? daRegra(r) : vazio());
  }, [sel, regras]);

  const nomeDestino = (d: string) => (d === LIVRE ? "Operacional (livre)" : (caixinhas.find((c) => c.id === d)?.nome ?? "Caixinha arquivada"));
  const itens: ItemDeRegra[] = rascunho.linhas.map((l) => ({ caixinhaId: l.destino === LIVRE ? null : l.destino, bp: bpDoTexto(l.texto) ?? 0 }));
  const motivo = !rascunho.nome.trim() ? "Dê um nome à regra." : motivoDaDivisao(itens);
  const partes = !motivoDaDivisao(itens) ? ratear(EXEMPLO, itens) : [];
  const soma = somaBp(itens);
  const usados = new Set(rascunho.linhas.map((l) => l.destino));
  const disponiveis = [{ id: LIVRE, nome: "Operacional (livre)" }, ...caixinhas].filter((d) => !usados.has(d.id));
  const maior = Math.max(1, ...itens.map((i) => i.bp));
  const aberta = regras.find((r) => r.id === rascunho.id) ?? null;

  const rodar = (p: Promise<{ ok: boolean; error?: string }>, ok: string) =>
    iniciar(async () => {
      const r = await p;
      if (!r.ok) return void toast.error(r.error ?? "Não foi possível.");
      toast.success(ok);
      router.refresh();
    });

  async function aoSelecionar(r: RegraDto, item: AcaoItemAcao) {
    // Confirmação SEMPRE antes da transição (React 19 suspenderia o diálogo dentro dela).
    if (item.confirmar && !(await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" })))
      return;
    if (item.id === ACAO_EDITAR) setSel(r.id);
    else if (item.id === ACAO_DUPLICAR) rodar(duplicarRegra({ id: r.id }), "Regra duplicada.");
    else if (item.id === ACAO_ATIVAR || item.id === ACAO_DESATIVAR) rodar(alternarAtivaRegra({ id: r.id }), item.id === ACAO_ATIVAR ? "Regra ativada." : "Regra deixada inativa.");
    else if (item.id === ACAO_PADRAO) rodar(tornarPadraoRegra({ id: r.id }), "Regra padrão definida.");
    else if (item.id === ACAO_EXCLUIR) {
      if (sel === r.id) setSel(null);
      rodar(excluirRegra({ id: r.id }), "Regra excluída.");
    }
  }

  function salvar() {
    if (motivo) return;
    iniciar(async () => {
      const r = await salvarRegra({ id: rascunho.id ?? undefined, nome: rascunho.nome, categoriasIds: rascunho.categoriasIds, itens });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Regra salva. Vale para as próximas distribuições.");
      setSel(r.data.id);
      router.refresh();
    });
  }

  const editarLinha = (i: number, parcial: Partial<Rascunho["linhas"][number]>) => setRascunho((r) => ({ ...r, linhas: r.linhas.map((l, k) => (k === i ? { ...l, ...parcial } : l)) }));

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Regras de distribuição"
        descricao="Como cada recebimento é sugerido entre as caixinhas."
        acoes={
          podeGerir ? (
            <Button
              size="sm"
              onClick={() => {
                setSel(NOVA);
                setRascunho(vazio());
              }}
            >
              <Plus className="size-4" aria-hidden /> Nova regra
            </Button>
          ) : undefined
        }
      />
      {subnav}
      <AbasCaixinhas ativa="regras" />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[22.5rem_minmax(0,1fr)]">
        <section aria-label="Regras" className="min-w-0 overflow-hidden rounded-sm border bg-card shadow-[var(--card-shadow)]">
          {regras.length === 0 ? (
            <EmptyState
              icon={Split}
              title="Nenhuma regra ainda."
              description="Uma regra diz como um recebimento é sugerido entre as caixinhas."
              action={
                podeGerir ? (
                  <Button size="sm" onClick={() => setSel(NOVA)}>
                    Nova regra
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="px-3 pt-2">
                <DicaMenuContexto />
              </div>
              <ul>
                {regras.map((r) => renderRegra(r))}
              </ul>
            </>
          )}
        </section>

        {podeGerir ? (
          <section aria-labelledby="ed-t" className="flex min-w-0 flex-col gap-4 rounded-sm border border-l-[3px] border-l-primary bg-card p-5 shadow-[var(--card-shadow)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="ed-t" className="text-base font-bold">
                {rascunho.id ? "Editar regra" : "Nova regra"}
              </h2>
              <span className="text-[13px] text-muted-foreground">Alterações valem para as próximas distribuições.</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="r-nome">Nome</Label>
                <Input id="r-nome" value={rascunho.nome} maxLength={80} placeholder="Ex.: Recebimento de cliente" onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="r-quando">Vale para receitas de</Label>
                <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border px-1.5 py-1">
                  {rascunho.categoriasIds.map((id) => {
                    const c = categorias.find((x) => x.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs">
                        {c ? `${c.codigo} ${c.nome}` : "Categoria removida"}
                        <button type="button" aria-label={`Tirar ${c?.nome ?? "categoria"}`} onClick={() => setRascunho((r) => ({ ...r, categoriasIds: r.categoriasIds.filter((x) => x !== id) }))}>
                          <X className="size-3" aria-hidden />
                        </button>
                      </span>
                    );
                  })}
                  <Select value="" onValueChange={(v) => v && setRascunho((r) => ({ ...r, categoriasIds: [...r.categoriasIds, v] }))} items={Object.fromEntries(categorias.map((c) => [c.id, `${c.codigo} ${c.nome}`]))}>
                    <SelectTrigger id="r-quando" size="sm" className="h-7 w-auto min-w-40 border-0 shadow-none">
                      <SelectValue placeholder="Adicionar categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias
                        .filter((c) => !rascunho.categoriasIds.includes(c.id))
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.codigo} · {c.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">Sem categoria, a regra só serve se for a padrão.</p>
              </div>
            </div>

            {/* `relative`: o `sr-only` das células é absoluto e, sem ancestral posicionado, escaparia da rolagem. */}
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                    <th className="py-2">Destino</th>
                    <th className="w-24 py-2 text-right">%</th>
                    <th className="w-1/3 py-2 pl-4">Parte</th>
                    <th className="py-2 text-right">Em {brlC(EXEMPLO)}</th>
                    <th className="w-10 py-2">
                      <span className="sr-only">Remover</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rascunho.linhas.map((l, i) => {
                    const bp = itens[i].bp;
                    const parte = partes[i];
                    const opcoes = [{ id: LIVRE, nome: "Operacional (livre)" }, ...caixinhas].filter((d) => d.id === l.destino || !usados.has(d.id));
                    return (
                      <tr key={l.chave} className="border-b">
                        <td className="py-1.5 pr-2">
                          <Select value={l.destino} onValueChange={(v) => v && editarLinha(i, { destino: v })} items={Object.fromEntries([...opcoes, { id: l.destino, nome: nomeDestino(l.destino) }].map((o) => [o.id, o.nome]))}>
                            <SelectTrigger aria-label={`Destino ${i + 1}`} size="sm" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {opcoes.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{l.destino === LIVRE ? "Fica no caixa, sem destino" : "Caixinha"}</span>
                        </td>
                        <td className="py-1.5 text-right">
                          <label className="sr-only" htmlFor={`bp-${l.chave}`}>
                            Percentual para {nomeDestino(l.destino)}
                          </label>
                          <Input id={`bp-${l.chave}`} inputMode="decimal" value={l.texto} className="ml-auto h-8 w-[4.5rem] text-right font-mono" onChange={(e) => editarLinha(i, { texto: e.target.value })} />
                        </td>
                        <td className="py-1.5 pl-4">
                          <Progress valor={(bp / maior) * 100} rotulo={`${nomeDestino(l.destino)}: ${bpParaTexto(bp)}`} />
                        </td>
                        <td className="py-1.5 text-right font-mono">{parte ? brlC(parte.valor) : "—"}</td>
                        <td className="py-1.5 text-right">
                          <Button size="icon-sm" variant="ghost" aria-label={`Remover ${nomeDestino(l.destino)}`} onClick={() => setRascunho((r) => ({ ...r, linhas: r.linhas.filter((_, k) => k !== i) }))}>
                            <X className="size-3.5" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={5} className="py-1.5">
                      <Select
                        value=""
                        onValueChange={(v) => v && setRascunho((r) => ({ ...r, linhas: [...r.linhas, { chave: `n-${Date.now()}-${r.linhas.length}`, destino: v, texto: "" }] }))}
                        items={Object.fromEntries(disponiveis.map((d) => [d.id, d.nome]))}
                      >
                        <SelectTrigger size="sm" className="w-auto min-w-44" disabled={disponiveis.length === 0}>
                          <SelectValue placeholder="+ Adicionar destino" />
                        </SelectTrigger>
                        <SelectContent>
                          {disponiveis.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                  <tr className="font-bold">
                    <td className="py-2">Total</td>
                    <td className={cn("py-2 text-right font-mono", soma === BP_TOTAL ? "text-success" : "text-destructive")}>{bpParaTexto(soma)}</td>
                    <td className="py-2 pl-4 text-xs font-normal text-muted-foreground">{soma === BP_TOTAL ? "fecha 100%" : "precisa fechar 100%"}</td>
                    <td className="py-2 text-right font-mono">{partes.length ? brlC(EXEMPLO) : "—"}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            {motivo && rascunho.linhas.length > 0 && (
              <p role="alert" className="text-[13px] font-medium text-destructive">
                {motivo}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 rounded-sm border bg-muted/30 px-3 py-2 text-[12.5px]">
              <span>
                <b>Quando o dinheiro entra:</b> sugerir, e você confirma. “Distribuir sozinho” fica para depois — hoje toda distribuição passa por confirmação.
              </span>
              <span>“Operacional (livre)” não vai para caixinha: fica disponível no caixa.</span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {rascunho.id && (
                <Button variant="outline" onClick={() => setRascunho(aberta ? daRegra(aberta) : vazio())}>
                  Desfazer alterações
                </Button>
              )}
              <Button disabled={pendente || !!motivo} onClick={salvar}>
                Salvar regra
              </Button>
            </div>
          </section>
        ) : (
          <p className="rounded-sm border bg-card p-4 text-[13px] text-muted-foreground">Quem gere o Financeiro edita as regras. Você vê como cada recebimento é sugerido.</p>
        )}
      </div>
    </div>
  );

  // Função de renderização, NÃO componente: um componente definido aqui dentro remontaria as linhas e
  // fecharia o menu de contexto aberto (ADR-0002).
  function renderRegra(r: RegraDto) {
    const itensMenu = itensDeRegra({ nome: r.nome, ativa: r.ativa, padrao: r.padrao, usos: r.usos }, { podeGerir, totalDeRegras: regras.length });
    const aoEscolher = (item: AcaoItemAcao) => void aoSelecionar(r, item);
    const aberta = sel === r.id;
    return (
      <li key={r.id} className="border-t first:border-t-0">
        <LinhaComMenu
          itens={itensMenu}
          onSelect={aoEscolher}
          render={<div className={cn("flex items-start gap-2.5 px-3.5 py-3", aberta && "border-l-[3px] border-l-primary bg-muted", !r.ativa && "opacity-70")} />}
        >
          <button type="button" onClick={() => setSel(r.id)} className="min-w-0 flex-1 text-left" aria-current={aberta ? "true" : undefined}>
            <span className="flex flex-wrap items-center gap-1.5">
              <b>{r.nome}</b>
              {r.padrao && <span className="rounded-sm border border-primary px-1.5 text-xs">Padrão</span>}
              {!r.ativa && <span className="rounded-sm border px-1.5 text-xs">Inativa</span>}
            </span>
            <span className="block text-[12.5px] text-muted-foreground">
              {r.categoriasNomes.length ? `Receitas ${r.categoriasNomes.join(", ")}` : r.padrao ? "Receitas sem regra própria" : "Sem categoria: não é sugerida"} · {r.itens.length} {r.itens.length === 1 ? "destino" : "destinos"} ·{" "}
              {r.usos === 0 ? "nunca usada" : `usada ${r.usos} ${r.usos === 1 ? "vez" : "vezes"}`}
            </span>
          </button>
          <BotaoAcoes itens={itensMenu} onSelect={aoEscolher} rotulo={`Ações da regra ${r.nome}`} className="size-8" />
        </LinhaComMenu>
      </li>
    );
  }
}
