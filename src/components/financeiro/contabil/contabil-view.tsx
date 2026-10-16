"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Download, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { AcaoItemAcao, AcaoItem } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, cn } from "@/lib/utils";
import {
  ACAO_COPIAR_CONTA,
  ACAO_ESCOLHER_CONTA,
  ACAO_LIMPAR_CONTA,
  ACAO_VER_LANCAMENTOS,
  itensDeCategoriaContabil,
  itensDeContaBancariaContabil,
} from "@/modules/financeiro/contabil/acoes";
import { copiarContaContabil, definirContaContabil, exportarMesContabil, lancamentosDaCategoriaNoMes, limparContaContabil } from "@/modules/financeiro/contabil/actions";
import {
  complementosCortados,
  LIMITE_COMPLEMENTO_ALTERDATA,
  linhasSemConta,
  MOTIVO_ALTERDATA_SEM_CONTA,
  type FormatoContabil,
} from "@/modules/financeiro/contabil/arquivo";
import type { CategoriaContabilDto, ContaBancariaContabilDto, ContaDoPlanoDto, TelaContabil } from "@/modules/financeiro/contabil/queries";

type Aba = "depara" | "exportacao";
type Alvo = { alvo: "categoria" | "conta_bancaria"; id: string; rotulo: string; prefixo: string };
type LancamentoDoMes = { id: string; descricao: string; tipo: "receita" | "despesa"; valor: number; data: string };

const NATUREZA = (c: CategoriaContabilDto) => (c.natureza === "fora_do_resultado" ? "Fora do resultado" : c.tipo === "receita" ? "Receita" : "Despesa");
const dataCurta = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const valorBr = (centavos: number) => brl(centavos / 100).replace(/^R\$\s?/, "");
const mesSo = (rotulo: string) => rotulo.split("/")[0];

/**
 * Integração contábil (M5) — mock "Integração contábil" (canvas do Financeiro, 2026-10-02): de-para das
 * categorias e das contas bancárias com o plano do contador, e a exportação do mês fechado. O arquivo é
 * gerado pelo motor puro `contabil/partidas.ts` (reconhecimento + baixa, pedido do contador).
 */
export function ContabilView({ dados, abaInicial, subnav }: { dados: TelaContabil; abaInicial: Aba; subnav?: React.ReactNode }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, iniciar] = useTransition();
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [filtro, setFiltro] = useState<"todas" | "sem">("todas");
  const [formato, setFormato] = useState<FormatoContabil>("alterdata");
  const [escolhendo, setEscolhendo] = useState<Alvo | null>(null);
  const [copiandoPara, setCopiandoPara] = useState<CategoriaContabilDto | null>(null);
  const [lista, setLista] = useState<{ titulo: string; itens: LancamentoDoMes[] } | null>(null);

  const mes = mesSo(dados.rotuloMes);
  const categorias = dados.categorias.filter((c) => c.natureza !== "transferencia");
  // Grupo sem conta própria não falta: cada filha usa a sua (só falta se um lançamento do mês usa o próprio grupo).
  const soGrupo = (c: CategoriaContabilDto) => c.efetiva == null && !c.naoExportar && c.grupo && !c.pendente;
  const semConta = (c: CategoriaContabilDto) => c.efetiva == null && !c.naoExportar && !soGrupo(c);
  const faltam = categorias.filter(semConta).length;
  const visiveis = filtro === "sem" ? categorias.filter(semConta) : categorias;
  const pendCategorias = dados.pendencias.filter((p) => p.alvo === "categoria");
  // O layout do contador não aceita conta em branco (nem a do cartão, que o contador ainda vai criar): o servidor barra igual.
  const linhasSemContaNoArquivo = linhasSemConta(dados.linhas);
  const cortados = complementosCortados(dados.linhas);
  const motivoExportar = !dados.mesFechado
    ? "Só meses fechados exportam, para o arquivo bater com o relatório que o contador já recebeu."
    : !dados.planoImportado
      ? "Falta importar o plano de contas do contador: sem ele não há conta para escolher."
      : pendCategorias.length > 0
        ? "Preencha o de-para antes de exportar."
        : formato === "alterdata" && linhasSemContaNoArquivo > 0
          ? MOTIVO_ALTERDATA_SEM_CONTA(linhasSemContaNoArquivo)
          : !dados.linhas.length
            ? "Nada para exportar neste mês."
            : null;

  const semRede = "Não foi possível falar com o servidor. Confira a conexão (ou entre de novo, se a sessão expirou) e tente outra vez.";
  const rodar = (p: Promise<{ ok: boolean; error?: string }>, ok: string) =>
    iniciar(async () => {
      try {
        const r = await p;
        if (!r.ok) return void toast.error(r.error ?? "Não foi possível.");
        toast.success(ok);
        router.refresh();
      } catch {
        toast.error(semRede);
      }
    });

  /** Baixa o arquivo JÁ registrado. Por fetch (e não por navegação) para a recusa da rota virar aviso na tela, não JSON numa aba. */
  async function baixarArquivo(id: string) {
    const res = await fetch(`/api/financeiro/contabil/arquivo?id=${id}`);
    const tipo = res.headers.get("Content-Type") ?? "";
    if (!res.ok || tipo.includes("text/html")) {
      const corpo = tipo.includes("json") ? ((await res.json().catch(() => null)) as { error?: string } | null) : null;
      return void toast.error(corpo?.error ?? "Não foi possível baixar o arquivo. A exportação ficou registrada: tente de novo.");
    }
    const nome = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `Contabil_${dados.mes}`;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportar() {
    if (motivoExportar) return;
    iniciar(async () => {
      try {
        const r = await exportarMesContabil({ mes: dados.mes, formato });
        if (!r.ok) return void toast.error(r.error);
        toast.success(`Exportação de ${dados.rotuloMes} registrada: ${r.data.linhas} ${r.data.linhas === 1 ? "linha" : "linhas"}.`);
        await baixarArquivo(r.data.id);
      } catch {
        toast.error(semRede);
      }
    });
  }

  async function aoEscolherCategoria(c: CategoriaContabilDto, item: AcaoItemAcao) {
    if (item.id === ACAO_ESCOLHER_CONTA) setEscolhendo({ alvo: "categoria", id: c.id, rotulo: `${c.codigo} ${c.nome}`, prefixo: c.tipo === "receita" ? "4" : "3" });
    else if (item.id === ACAO_COPIAR_CONTA) setCopiandoPara(c);
    else if (item.id === ACAO_VER_LANCAMENTOS) {
      const r = await lancamentosDaCategoriaNoMes({ categoriaId: c.id, mes: dados.mes });
      if (r.ok) setLista({ titulo: `${c.codigo} ${c.nome} · ${dados.rotuloMes}`, itens: r.data });
      else toast.error(r.error);
    } else if (item.id === ACAO_LIMPAR_CONTA) {
      if (!(await confirm({ title: "Limpar a conta contábil?", description: "A categoria volta a usar a conta da categoria mãe, se houver.", confirmLabel: "Limpar" }))) return;
      rodar(limparContaContabil({ alvo: "categoria", alvoId: c.id }), "Conta limpa.");
    }
  }

  function aoEscolherBanco(b: ContaBancariaContabilDto, item: AcaoItemAcao) {
    if (item.id === ACAO_ESCOLHER_CONTA) setEscolhendo({ alvo: "conta_bancaria", id: b.id, rotulo: b.nome, prefixo: "1.1" });
    else if (item.id === ACAO_LIMPAR_CONTA) rodar(limparContaContabil({ alvo: "conta_bancaria", alvoId: b.id }), "Conta limpa.");
  }

  const contaDe = (reduzido: number | null) => {
    if (reduzido == null) return null;
    const nome = dados.nomes[reduzido];
    if (!nome) return { classificacao: String(reduzido), nome: "fora do plano importado" };
    const [classificacao, ...resto] = nome.split(" ");
    return { classificacao, nome: resto.join(" ") };
  };

  const renderConta = (reduzido: number | null, extra?: string) => {
    const c = contaDe(reduzido);
    if (!c) return <span className="inline-flex rounded-sm border border-warning px-1.5 text-xs font-semibold text-warning">Falta escolher</span>;
    return (
      <span className={cn("min-w-0", extra && "text-muted-foreground")} title={`Código reduzido ${reduzido}`}>
        <span className="font-mono text-xs text-muted-foreground">{c.classificacao}</span> {c.nome}
        {extra && <span className="ml-1 text-xs">({extra})</span>}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Integração contábil"
        descricao="Relacionar o plano de contas ao do contador e exportar o mês fechado."
        acoes={
          <Button size="sm" disabled={pendente || !!motivoExportar} title={motivoExportar ?? undefined} onClick={exportar}>
            Exportar {mes}
          </Button>
        }
      />
      {subnav}

      <div role="tablist" aria-label="Integração contábil" className="flex flex-wrap border-b">
        {(["depara", "exportacao"] as const).map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={aba === a}
            onClick={() => setAba(a)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold",
              aba === a ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a === "depara" ? "De-para" : "Exportação"}
            {a === "depara" && faltam > 0 && <span className="ml-1.5 rounded-sm bg-muted px-1.5 font-mono text-[11px]">{faltam} faltam</span>}
          </button>
        ))}
      </div>

      <div role="status" className="flex items-start gap-2 rounded-sm border border-warning/60 bg-warning/10 px-3 py-2 text-[13px]">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        {dados.planoImportado ? (
          <div>
            <b>As contas são do plano do contador (Alterdata).</b> A conta escolhida vale para as filhas da categoria que não tiverem a própria. A exportação já sai no
            modelo de importação dele (“Layout do contador”); Excel e CSV são o arquivo genérico, com centro de custo e chave da NF-e em colunas próprias.
          </div>
        ) : (
          <div>
            <b>Falta importar o plano de contas do contador.</b> Sem ele não dá para escolher as contas; peça a quem cuida do servidor para rodar a importação do plano.
          </div>
        )}
      </div>

      {aba === "depara" ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <section aria-label="De-para de categorias" className="min-w-0 rounded-sm border bg-card shadow-[var(--card-shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-sm font-bold">Categorias → conta contábil</h2>
                <div className="inline-flex" role="group" aria-label="Filtro">
                  {(["todas", "sem"] as const).map((f) => (
                    <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} onClick={() => setFiltro(f)} className="rounded-none first:rounded-l-sm last:rounded-r-sm">
                      {f === "todas" ? "Todas" : "Sem conta contábil"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="px-4 pt-2">
                <DicaMenuContexto />
              </div>
              <div className="overflow-x-auto px-2 pb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-2 py-2 font-semibold">Categoria do SenaHub</th>
                      <th className="px-2 py-2 font-semibold">Natureza</th>
                      <th className="px-2 py-2 font-semibold">Conta contábil</th>
                      <th className="w-10" aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>{visiveis.map((c) => renderCategoria(c))}</tbody>
                </table>
                {visiveis.length === 0 && <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">Toda categoria tem conta contábil.</p>}
              </div>
            </section>

            <aside className="flex min-w-0 flex-col gap-4">
              <section className="rounded-sm border bg-card shadow-[var(--card-shadow)]">
                <h2 className="border-b px-4 py-3 text-sm font-bold">Contas bancárias → conta contábil</h2>
                <ul className="flex flex-col py-1 text-sm">
                  {dados.contasBancarias.length === 0 && <li className="px-4 py-3 text-[13px] text-muted-foreground">Nenhuma conta bancária ativa. Cadastre em Financeiro → Mais → Cadastros.</li>}
                  {dados.contasBancarias.map((b) => renderBanco(b))}
                </ul>
              </section>
              {renderCartaoExportacao()}
            </aside>
          </div>
          {renderPrevia(5)}
        </>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
          {renderCartaoExportacao()}
          {renderPrevia(null)}
        </div>
      )}

      <EscolherContaDialog alvo={escolhendo} plano={dados.plano} onClose={() => setEscolhendo(null)} onEscolher={(reduzido) => {
        const a = escolhendo;
        if (!a) return;
        setEscolhendo(null);
        rodar(definirContaContabil({ alvo: a.alvo, alvoId: a.id, reduzido }), "Conta contábil escolhida.");
      }} />

      <Dialog open={copiandoPara !== null} onOpenChange={(o) => !o && setCopiandoPara(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copiar a conta de outra categoria</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <ul className="divide-y rounded-sm border text-sm">
              {copiandoPara &&
                categorias
                  .filter((o) => o.id !== copiandoPara.id && o.tipo === copiandoPara.tipo && o.propria != null)
                  .map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        className="flex w-full flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
                        onClick={() => {
                          const para = copiandoPara;
                          setCopiandoPara(null);
                          rodar(copiarContaContabil({ deCategoriaId: o.id, paraCategoriaId: para.id }), "Conta copiada.");
                        }}
                      >
                        <b>
                          {o.codigo} {o.nome}
                        </b>
                        {renderConta(o.propria)}
                      </button>
                    </li>
                  ))}
            </ul>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={lista !== null} onOpenChange={(o) => !o && setLista(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lista?.titulo}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {lista && lista.itens.length === 0 && <p className="text-[13px] text-muted-foreground">Nenhum lançamento desta categoria no mês.</p>}
            {lista && lista.itens.length > 0 && (
              <ul className="divide-y rounded-sm border text-sm">
                {lista.itens.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate">{l.descricao}</span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-[13px]">
                      {dataCurta(l.data)} · {l.tipo === "receita" ? "+" : "−"} {brl(l.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );

  // Funções de renderização, NÃO componentes: componente definido aqui dentro remontaria as linhas e
  // fecharia o menu de contexto aberto (ADR-0002).
  function renderCategoria(c: CategoriaContabilDto) {
    const temDeOndeCopiar = categorias.some((o) => o.id !== c.id && o.tipo === c.tipo && o.propria != null);
    const itens = itensDeCategoriaContabil({ temLinhaPropria: c.propria != null || (c.naoExportar && c.herdadaDe == null), temDeOndeCopiar }, mes);
    const aoEscolher = (item: AcaoItemAcao) => void aoEscolherCategoria(c, item);
    return (
      <LinhaComMenu key={c.id} itens={itens} onSelect={aoEscolher} render={<tr className="border-t" />}>
        <td className="px-2 py-2">
          <b>
            {c.codigo} {c.nome}
          </b>
        </td>
        <td className="px-2 py-2 text-muted-foreground">{NATUREZA(c)}</td>
        <td className="px-2 py-2">
          {c.naoExportar ? (
            <span className="text-[13px] text-muted-foreground">Não exportar — o contador lança{c.herdadaDe ? ` (da mãe ${c.herdadaDe})` : ""}</span>
          ) : soGrupo(c) ? (
            <span className="text-[13px] text-muted-foreground">Grupo — vale a conta de cada filha</span>
          ) : (
            renderConta(c.efetiva, c.propria == null && c.herdadaDe ? `da mãe ${c.herdadaDe}` : undefined)
          )}
        </td>
        <td className="px-1 py-1">
          <BotaoAcoes itens={itens} onSelect={aoEscolher} rotulo={`Ações de ${c.codigo} ${c.nome}`} className="size-8" />
        </td>
      </LinhaComMenu>
    );
  }

  function renderBanco(b: ContaBancariaContabilDto) {
    const itens: AcaoItem[] = itensDeContaBancariaContabil({ temConta: b.conta != null, contaId: b.id, mes: dados.mes, rotuloMes: mes });
    const aoEscolher = (item: AcaoItemAcao) => aoEscolherBanco(b, item);
    return (
      <LinhaComMenu key={b.id} itens={itens} onSelect={aoEscolher} render={<li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5" />}>
        <span className="min-w-0">
          {b.nome}
          {b.investimento && <span className="ml-1 text-xs text-muted-foreground">(investimento)</span>}
        </span>
        <span className="flex min-w-0 items-center gap-1">
          {renderConta(b.conta)}
          <BotaoAcoes itens={itens} onSelect={aoEscolher} rotulo={`Ações de ${b.nome}`} className="size-8" />
        </span>
      </LinhaComMenu>
    );
  }

  function renderCartaoExportacao() {
    return (
      <section className="min-w-0 rounded-sm border bg-card shadow-[var(--card-shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-bold">Exportação — {dados.rotuloMes}</h2>
          <span className={cn("inline-flex rounded-sm border px-1.5 text-xs font-semibold", dados.mesFechado ? "border-success text-success" : "border-warning text-warning")}>
            {dados.mesFechado ? "Mês fechado" : "Mês aberto"}
          </span>
        </div>
        <div className="flex flex-col gap-3 px-4 py-3 text-[13px]">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
            <label htmlFor="ct-mes" className="text-xs font-semibold">
              Mês
            </label>
            <Select value={dados.mes} onValueChange={(v) => v && router.push(`/financeiro/contabil?mes=${v}${aba === "exportacao" ? "&aba=exportacao" : ""}`)} items={Object.fromEntries(dados.meses.map((m) => [m.mes, m.fechado ? m.rotulo : `${m.rotulo} (aberto)`]))}>
              <SelectTrigger id="ct-mes" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dados.meses.map((m) => (
                  <SelectItem key={m.mes} value={m.mes}>
                    {m.fechado ? m.rotulo : `${m.rotulo} (aberto)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-semibold">Formato</span>
            <div className="inline-flex flex-wrap" role="group" aria-label="Formato" aria-describedby="ct-formato-ajuda">
              <Button size="sm" variant={formato === "xlsx" ? "default" : "outline"} aria-pressed={formato === "xlsx"} onClick={() => setFormato("xlsx")} className="rounded-none rounded-l-sm">
                Excel
              </Button>
              <Button size="sm" variant={formato === "csv" ? "default" : "outline"} aria-pressed={formato === "csv"} onClick={() => setFormato("csv")} className="rounded-none">
                CSV
              </Button>
              <Button size="sm" variant={formato === "alterdata" ? "default" : "outline"} aria-pressed={formato === "alterdata"} onClick={() => setFormato("alterdata")} className="rounded-none rounded-r-sm">
                Layout do contador
              </Button>
            </div>
            <span id="ct-formato-ajuda" className="text-xs text-muted-foreground">
              {formato === "alterdata"
                ? `Modelo de importação do contador: débito e crédito pela classificação do plano dele, data, valor e complemento do histórico (até ${LIMITE_COMPLEMENTO_ALTERDATA} caracteres, com o número do documento). À direita: centro de custo e projeto (só nas linhas de receita e despesa) e a chave de acesso da NF-e.`
                : "Arquivo genérico: data, conta de débito, conta de crédito, valor, histórico, documento, chave da NF-e, centro de custo e projeto."}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Cada conta a pagar ou a receber sai duas vezes: na competência e no pagamento. Só meses fechados exportam, para o arquivo bater com o relatório que o contador já recebeu.
          </p>
          {formato === "alterdata" && cortados > 0 && (
            <p className="text-xs text-muted-foreground">
              {cortados} {cortados === 1 ? "complemento passa" : "complementos passam"} de {LIMITE_COMPLEMENTO_ALTERDATA} caracteres: a descrição sai encurtada (…) e o número do
              documento fica inteiro.
            </p>
          )}
          {dados.fora.naoExportar > 0 && (
            <p className="text-xs text-muted-foreground">
              {dados.fora.naoExportar} {dados.fora.naoExportar === 1 ? "lançamento ficou" : "lançamentos ficaram"} fora: categoria marcada “não exportar” (a folha, que o contador lança).
            </p>
          )}
          {dados.fora.aguardandoAprovacao > 0 && (
            <p className="text-xs text-muted-foreground">
              {dados.fora.aguardandoAprovacao} {dados.fora.aguardandoAprovacao === 1 ? "conta aguardando aprovação ficou" : "contas aguardando aprovação ficaram"} fora.
            </p>
          )}
          {dados.pendencias.length > 0 && (
            <div role="status" className="rounded-sm border border-destructive/60 bg-destructive/5 px-3 py-2">
              <b>
                {dados.pendencias.length} {dados.pendencias.length === 1 ? "conta aparece" : "contas aparecem"} em branco no arquivo.
              </b>{" "}
              {pendCategorias.length > 0 ? "Preencha o de-para antes de exportar." : "Elas dependem de contas que o contador ainda vai criar."}
              <ul className="mt-1 list-disc pl-5">
                {dados.pendencias.map((p) => (
                  <li key={p.rotulo}>
                    {p.rotulo} · {p.lancamentos} {p.lancamentos === 1 ? "lançamento" : "lançamentos"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button disabled={pendente || !!motivoExportar} aria-describedby={motivoExportar ? "ct-motivo-exportar" : undefined} onClick={exportar}>
            <Download className="size-4" aria-hidden /> {pendente ? "Exportando…" : `Exportar ${mes}`}
          </Button>
          {motivoExportar && (
            <p id="ct-motivo-exportar" className="text-xs text-muted-foreground">
              {motivoExportar}
            </p>
          )}
        </div>
      </section>
    );
  }

  function renderPrevia(limite: number | null) {
    const linhas = limite == null ? dados.linhas : dados.linhas.slice(0, limite);
    return (
      <section aria-label={`Prévia do arquivo de ${mes}`} className="min-w-0 rounded-sm border bg-card shadow-[var(--card-shadow)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-bold">Prévia do arquivo — {dados.rotuloMes}</h2>
          <span className="text-xs text-muted-foreground">
            {linhas.length} de {dados.linhas.length} linhas · total {valorBr(dados.totalCentavos)}
          </span>
        </div>
        {dados.linhas.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Nenhum lançamento gera partida neste mês.</p>
        ) : (
          <div className={cn("overflow-x-auto px-2 pb-2", limite == null && "max-h-[70svh] overflow-y-auto")}>
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-semibold">Data</th>
                  <th className="px-2 py-2 font-semibold">Débito</th>
                  <th className="px-2 py-2 font-semibold">Crédito</th>
                  <th className="px-2 py-2 text-right font-semibold">Valor</th>
                  <th className="px-2 py-2 font-semibold">Histórico</th>
                  <th className="px-2 py-2 font-semibold">Documento</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={`${l.lancamentoId}-${l.evento}-${i}`} className="border-t">
                    <td className="px-2 py-1.5 font-mono">{dataCurta(l.data)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono" title={l.debito != null ? dados.nomes[l.debito] : "Falta o de-para"}>
                      {l.debitoClassificacao ?? <span className="text-destructive">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono" title={l.credito != null ? dados.nomes[l.credito] : "Falta o de-para"}>
                      {l.creditoClassificacao ?? <span className="text-destructive">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{valorBr(l.valorCentavos)}</td>
                    <td className="max-w-[28rem] truncate px-2 py-1.5 text-muted-foreground">{l.historico}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{l.documento ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }
}

/** Escolher a conta do plano: busca por código, classificação ou nome; começa no grupo que faz sentido. */
function EscolherContaDialog({ alvo, plano, onClose, onEscolher }: { alvo: Alvo | null; plano: ContaDoPlanoDto[]; onClose: () => void; onEscolher: (reduzido: number) => void }) {
  const [busca, setBusca] = useState("");
  const [todoPlano, setTodoPlano] = useState(false);
  const achadas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return plano
      .filter((c) => todoPlano || q || !alvo || c.classificacao.startsWith(alvo.prefixo))
      .filter((c) => !q || c.nome.toLowerCase().includes(q) || c.classificacao.startsWith(q) || String(c.reduzido) === q)
      .slice(0, 150);
  }, [plano, busca, todoPlano, alvo]);
  return (
    <Dialog
      open={alvo !== null}
      onOpenChange={(o) => {
        if (!o) {
          setBusca("");
          setTodoPlano(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conta contábil de {alvo?.rotulo}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Input aria-label="Buscar no plano" placeholder="Nome, classificação ou código" value={busca} onChange={(e) => setBusca(e.target.value)} className="min-w-48 flex-1" />
            <Button size="sm" variant={todoPlano ? "default" : "outline"} onClick={() => setTodoPlano((v) => !v)}>
              Todo o plano
            </Button>
          </div>
          {plano.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">O plano do contador ainda não foi importado.</p>
          ) : achadas.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nenhuma conta analítica com esse texto.</p>
          ) : (
            <ul className="divide-y rounded-sm border text-sm">
              {achadas.map((c) => (
                <li key={c.reduzido}>
                  <button
                    type="button"
                    className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      setBusca("");
                      setTodoPlano(false);
                      onEscolher(c.reduzido);
                    }}
                  >
                    <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{c.classificacao}</span>
                    <span className="min-w-0 flex-1">{c.nome}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.reduzido}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
