"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ListChecks, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { brl } from "@/lib/utils";
import {
  ACAO_ATIVAR,
  ACAO_DUPLICAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_PAUSAR,
  ACAO_SUBIR,
  ACAO_VER_LANCAMENTOS,
  itensDeRegraDePreenchimento,
} from "@/modules/financeiro/regras/acoes";
import { alternarAtivaRegra, duplicarRegra, excluirRegra, moverRegra, salvarRegra, simularRegra } from "@/modules/financeiro/regras/actions";
import { OPERADORES_POR_CAMPO, descreverCondicao, type CampoCondicao, type Condicao, type OperadorCondicao } from "@/modules/financeiro/regras/motor";
import type { OpcoesDasRegras, RegraPreenchimentoDto } from "@/modules/financeiro/regras/queries";

const NOVA = "__nova";
const NENHUM = "__nenhum";

const CAMPOS: Record<CampoCondicao, string> = { descricao: "Descrição", tipo: "Tipo", valor: "Valor", conta: "Conta" };
const OPERADORES: Record<OperadorCondicao, string> = { contem: "contém", igual: "é igual a", comeca: "começa com", maior: "é maior que", menor: "é menor que" };

type LinhaCondicao = { chave: string; campo: CampoCondicao; op: OperadorCondicao; texto: string; numero: number | null };
type Rascunho = {
  id: string | null;
  condicoes: LinhaCondicao[];
  categoriaId: string;
  centroId: string;
  formaId: string;
  projetoId: string;
  contato: string; // "f:<id>" fornecedor, "c:<id>" cliente, "" nenhum
  tags: string;
  ativo: boolean;
};

let contador = 0;
const chave = () => `c${++contador}`;
const linhaVazia = (): LinhaCondicao => ({ chave: chave(), campo: "descricao", op: "contem", texto: "", numero: null });
const vazio = (): Rascunho => ({ id: null, condicoes: [linhaVazia()], categoriaId: "", centroId: "", formaId: "", projetoId: "", contato: "", tags: "", ativo: true });
const daRegra = (r: RegraPreenchimentoDto): Rascunho => ({
  id: r.id,
  condicoes: r.condicoes.map((c) => ({
    chave: chave(),
    campo: c.campo,
    op: c.op,
    texto: c.campo === "valor" ? "" : String(c.valor),
    numero: c.campo === "valor" ? Number(c.valor) : null,
  })),
  categoriaId: r.categoriaId ?? "",
  centroId: r.centroId ?? "",
  formaId: r.formaId ?? "",
  projetoId: r.projetoId ?? "",
  contato: r.fornecedorId ? `f:${r.fornecedorId}` : r.clienteId ? `c:${r.clienteId}` : "",
  tags: r.tags.join(", "),
  ativo: r.ativo,
});

function condicaoDaLinha(l: LinhaCondicao): Condicao | null {
  if (l.campo === "valor") return l.numero && l.numero > 0 ? { campo: "valor", op: l.op, valor: l.numero } : null;
  const t = l.texto.trim();
  if (!t || (l.campo === "descricao" && t.length < 2)) return null;
  return { campo: l.campo, op: l.op, valor: t };
}

const tagsDoTexto = (t: string) => [...new Set(t.split(",").map((x) => x.trim()).filter(Boolean))];

type Casamentos = { total: number; amostra: { id: string; descricao: string; data: string; valor: number; tipo: "receita" | "despesa" }[] };

/**
 * Regras de preenchimento (mock "Regras"): lista ordenada com menu de contexto e `...` (ADR-0002) + editor.
 * QUANDO todas as condições batem → ENTÃO preenche o que estiver vazio. A primeira regra da lista que casa
 * vale; nunca sobrescreve o que a pessoa escolheu. Vale na conciliação, na importação e ao lançar.
 */
export function RegrasPreenchimentoView({
  regras,
  opcoes,
  podeGerir,
  subnav,
}: {
  regras: RegraPreenchimentoDto[];
  opcoes: OpcoesDasRegras;
  podeGerir: boolean;
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, iniciar] = useTransition();
  const [sel, setSel] = useState<string | null>(regras[0]?.id ?? null);
  const [rascunho, setRascunho] = useState<Rascunho>(() => (regras.length ? daRegra(regras[0]) : vazio()));
  const [previa, setPrevia] = useState<{ total: number } | null>(null);
  const [lista, setLista] = useState<Casamentos | null>(null);

  useEffect(() => {
    if (sel === NOVA) return;
    const r = regras.find((x) => x.id === sel);
    setRascunho(r ? daRegra(r) : vazio());
  }, [sel, regras]);

  const nomeConta = (id: string) => opcoes.contas.find((c) => c.id === id)?.nome ?? "conta removida";
  const nomeCategoria = (id: string | null) => {
    const c = opcoes.categorias.find((x) => x.id === id);
    return c ? `${c.codigo} ${c.nome}` : null;
  };

  const condicoes = rascunho.condicoes.map(condicaoDaLinha);
  const condicoesValidas = condicoes.every((c) => c !== null) ? (condicoes as Condicao[]) : null;
  const chaveDaPrevia = condicoesValidas ? JSON.stringify(condicoesValidas) : "";
  const tags = tagsDoTexto(rascunho.tags);
  const preencheAlgo = !!(rascunho.categoriaId || rascunho.centroId || rascunho.formaId || rascunho.projetoId || rascunho.contato || tags.length);
  const motivo = !condicoesValidas
    ? "Complete as condições (descrição com 2 letras ou mais, valor maior que zero)."
    : !preencheAlgo
      ? "Escolha ao menos uma coisa para preencher."
      : null;

  // Prévia "Casaria com N lançamentos dos últimos 12 meses": só lê, depois de uma pausa na digitação.
  useEffect(() => {
    if (!chaveDaPrevia || !podeGerir) {
      setPrevia(null);
      return;
    }
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await simularRegra({ condicoes: JSON.parse(chaveDaPrevia) as Condicao[], listar: false });
      if (vivo) setPrevia(r.ok ? { total: r.data.total } : null);
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [chaveDaPrevia, podeGerir]);

  const rodar = (p: Promise<{ ok: boolean; error?: string }>, ok: string) =>
    iniciar(async () => {
      const r = await p;
      if (!r.ok) return void toast.error(r.error ?? "Não foi possível.");
      toast.success(ok);
      router.refresh();
    });

  async function verLancamentos(cs: Condicao[]) {
    const r = await simularRegra({ condicoes: cs, listar: true });
    if (r.ok) setLista(r.data);
    else toast.error(r.error);
  }

  async function aoSelecionar(r: RegraPreenchimentoDto, item: AcaoItemAcao) {
    // Confirmação SEMPRE antes da transição (React 19 suspenderia o diálogo dentro dela).
    if (item.confirmar && !(await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" })))
      return;
    if (item.id === ACAO_EDITAR) setSel(r.id);
    else if (item.id === ACAO_VER_LANCAMENTOS) void verLancamentos(r.condicoes);
    else if (item.id === ACAO_DUPLICAR) rodar(duplicarRegra({ id: r.id }), "Regra duplicada (pausada, para você ajustar).");
    else if (item.id === ACAO_SUBIR) rodar(moverRegra({ id: r.id, direcao: "subir" }), "Regra subiu na ordem.");
    else if (item.id === ACAO_PAUSAR || item.id === ACAO_ATIVAR) rodar(alternarAtivaRegra({ id: r.id, ativo: item.id === ACAO_ATIVAR }), item.id === ACAO_ATIVAR ? "Regra ativada." : "Regra pausada.");
    else if (item.id === ACAO_EXCLUIR) {
      if (sel === r.id) setSel(null);
      rodar(excluirRegra({ id: r.id }), "Regra excluída.");
    }
  }

  function salvar() {
    if (motivo || !condicoesValidas) return;
    iniciar(async () => {
      const r = await salvarRegra({
        id: rascunho.id ?? undefined,
        condicoes: condicoesValidas,
        categoriaId: rascunho.categoriaId || null,
        centroId: rascunho.centroId || null,
        formaId: rascunho.formaId || null,
        projetoId: rascunho.projetoId || null,
        fornecedorId: rascunho.contato.startsWith("f:") ? rascunho.contato.slice(2) : null,
        clienteId: rascunho.contato.startsWith("c:") ? rascunho.contato.slice(2) : null,
        tags,
        ativo: rascunho.ativo,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Regra salva. Só vale daqui para frente: lançamentos antigos não mudam.");
      setSel(r.data.id);
      router.refresh();
    });
  }

  const editarLinha = (k: string, parcial: Partial<LinhaCondicao>) =>
    setRascunho((r) => ({ ...r, condicoes: r.condicoes.map((l) => (l.chave === k ? { ...l, ...parcial } : l)) }));
  const trocarCampo = (k: string, campo: CampoCondicao) =>
    editarLinha(k, { campo, op: OPERADORES_POR_CAMPO[campo][0], texto: campo === "tipo" ? "despesa" : "", numero: null });

  const contatos = useMemo(
    () => ({
      ...Object.fromEntries(opcoes.fornecedores.map((f) => [`f:${f.id}`, `Fornecedor · ${f.nome}`])),
      ...Object.fromEntries(opcoes.clientes.map((c) => [`c:${c.id}`, `Cliente · ${c.nome}`])),
    }),
    [opcoes.fornecedores, opcoes.clientes],
  );

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Regras de preenchimento"
        descricao="Preenchem categoria, centro, contato, forma, projeto e tags a partir do que o lançamento diz."
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

      <p className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]">
        <b>Onde as regras valem:</b> conciliação do extrato (OFX), importação de planilha e sugestão ao lançar. Nunca sobrescrevem o que você já escolheu. A{" "}
        <b>primeira regra da lista que casa</b> é a que vale: use “Subir na ordem” no menu da regra para mudar a prioridade.
      </p>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <section aria-label="Regras" className="min-w-0 overflow-hidden rounded-sm border bg-card shadow-[var(--card-shadow)]">
          {regras.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Nenhuma regra ainda."
              description="Uma regra preenche categoria e outros campos quando a descrição (ou o valor, ou a conta) bate."
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
              <ol>{regras.map((r, i) => renderRegra(r, i))}</ol>
            </>
          )}
        </section>

        {podeGerir ? (
          <section aria-labelledby="ed-t" className="flex min-w-0 flex-col gap-4 rounded-sm border border-l-[3px] border-l-primary bg-card p-5 shadow-[var(--card-shadow)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="ed-t" className="text-base font-bold">
                {rascunho.id ? "Editar regra" : "Nova regra"}
              </h2>
              <span className="text-[13px] text-muted-foreground">Regra nova só vale daqui para frente.</span>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-semibold">Quando</legend>
              {rascunho.condicoes.map((l) => (
                <div key={l.chave} className="flex flex-wrap items-center gap-2">
                  <Select value={l.campo} onValueChange={(v) => v && trocarCampo(l.chave, v as CampoCondicao)} items={CAMPOS}>
                    <SelectTrigger aria-label="Campo" size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CAMPOS) as CampoCondicao[]).map((c) => (
                        <SelectItem key={c} value={c}>
                          {CAMPOS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={l.op} onValueChange={(v) => v && editarLinha(l.chave, { op: v as OperadorCondicao })} items={OPERADORES}>
                    <SelectTrigger aria-label="Comparação" size="sm" className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERADORES_POR_CAMPO[l.campo].map((o) => (
                        <SelectItem key={o} value={o}>
                          {l.campo === "tipo" ? "é" : OPERADORES[o]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="min-w-40 flex-1">
                    {l.campo === "descricao" && (
                      <Input aria-label="Texto da descrição" value={l.texto} maxLength={80} placeholder="Ex.: CREA-SC" onChange={(e) => editarLinha(l.chave, { texto: e.target.value })} />
                    )}
                    {l.campo === "valor" && <InputMoeda aria-label="Valor" value={l.numero} onChange={(n) => editarLinha(l.chave, { numero: n })} />}
                    {l.campo === "tipo" && (
                      <Select value={l.texto || "despesa"} onValueChange={(v) => v && editarLinha(l.chave, { texto: v })} items={{ despesa: "Saída (despesa)", receita: "Entrada (receita)" }}>
                        <SelectTrigger aria-label="Tipo" size="sm" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="despesa">Saída (despesa)</SelectItem>
                          <SelectItem value="receita">Entrada (receita)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {l.campo === "conta" && (
                      <Select value={l.texto} onValueChange={(v) => v && editarLinha(l.chave, { texto: v })} items={Object.fromEntries(opcoes.contas.map((c) => [c.id, c.nome]))}>
                        <SelectTrigger aria-label="Conta" size="sm" className="w-full">
                          <SelectValue placeholder="Escolha a conta" />
                        </SelectTrigger>
                        <SelectContent>
                          {opcoes.contas.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Tirar condição"
                    disabled={rascunho.condicoes.length === 1}
                    onClick={() => setRascunho((r) => ({ ...r, condicoes: r.condicoes.filter((x) => x.chave !== l.chave) }))}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </div>
              ))}
              <div>
                <Button size="sm" variant="outline" disabled={rascunho.condicoes.length >= 5} onClick={() => setRascunho((r) => ({ ...r, condicoes: [...r.condicoes, linhaVazia()] }))}>
                  <Plus className="size-3.5" aria-hidden /> condição
                </Button>
                <span className="ml-2 text-xs text-muted-foreground">Todas precisam bater.</span>
              </div>
            </fieldset>

            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-semibold">Então preencher</legend>
              <Campo id="r-cat" rotulo="Categoria" valor={rascunho.categoriaId} onChange={(v) => setRascunho((r) => ({ ...r, categoriaId: v }))} itens={Object.fromEntries(opcoes.categorias.map((c) => [c.id, `${c.codigo} ${c.nome}`]))} />
              <Campo id="r-centro" rotulo="Centro de custo" valor={rascunho.centroId} onChange={(v) => setRascunho((r) => ({ ...r, centroId: v }))} itens={Object.fromEntries(opcoes.centros.map((c) => [c.id, c.nome]))} />
              <Campo id="r-contato" rotulo="Contato" valor={rascunho.contato} onChange={(v) => setRascunho((r) => ({ ...r, contato: v }))} itens={contatos} />
              <Campo id="r-forma" rotulo="Forma de pagamento" valor={rascunho.formaId} onChange={(v) => setRascunho((r) => ({ ...r, formaId: v }))} itens={Object.fromEntries(opcoes.formas.map((c) => [c.id, c.nome]))} />
              <Campo id="r-proj" rotulo="Projeto" valor={rascunho.projetoId} onChange={(v) => setRascunho((r) => ({ ...r, projetoId: v }))} itens={Object.fromEntries(opcoes.projetos.map((c) => [c.id, c.nome]))} />
              <div className="grid gap-1.5">
                <Label htmlFor="r-tags">Tags</Label>
                <Input id="r-tags" value={rascunho.tags} placeholder="Separe por vírgula" onChange={(e) => setRascunho((r) => ({ ...r, tags: e.target.value }))} />
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3 rounded-sm border bg-muted/30 px-3 py-2 text-[13px]" aria-live="polite">
              {previa ? (
                <>
                  <span>
                    Casaria com <b>{previa.total}</b> {previa.total === 1 ? "lançamento" : "lançamentos"} dos últimos 12 meses.
                  </span>
                  {previa.total > 0 && condicoesValidas && (
                    <Button size="sm" variant="outline" onClick={() => void verLancamentos(condicoesValidas)}>
                      Ver os {previa.total}
                    </Button>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Complete as condições para ver onde a regra casaria.</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch id="r-ativo" checked={rascunho.ativo} onCheckedChange={(v) => setRascunho((r) => ({ ...r, ativo: v }))} />
              <Label htmlFor="r-ativo">Regra ativa</Label>
            </div>

            {motivo && rascunho.condicoes.some((l) => l.texto || l.numero) && (
              <p role="alert" className="text-[13px] font-medium text-destructive">
                {motivo}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {rascunho.id && (
                <Button variant="outline" onClick={() => setRascunho(daRegra(regras.find((r) => r.id === rascunho.id) ?? regras[0]))}>
                  Desfazer alterações
                </Button>
              )}
              <Button disabled={pendente || !!motivo} onClick={salvar}>
                Salvar regra
              </Button>
            </div>
          </section>
        ) : (
          <p className="rounded-sm border bg-card p-4 text-[13px] text-muted-foreground">Quem gere o Financeiro edita as regras. Você vê o que cada uma preenche.</p>
        )}
      </div>

      <Dialog open={lista !== null} onOpenChange={(o) => !o && setLista(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançamentos que a regra casa</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {lista && (
              <>
                <p className="mb-2 text-[13px] text-muted-foreground">
                  {lista.total} nos últimos 12 meses{lista.total > lista.amostra.length ? `; os ${lista.amostra.length} mais recentes:` : ":"}
                </p>
                <ul className="divide-y rounded-sm border text-sm">
                  {lista.amostra.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate">{l.descricao}</span>
                      <span className="shrink-0 whitespace-nowrap font-mono text-[13px]">
                        {l.data.split("-").reverse().join("/")} · {l.tipo === "receita" ? "+" : "−"} {brl(l.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );

  // Função de renderização, NÃO componente: um componente definido aqui dentro remontaria as linhas e
  // fecharia o menu de contexto aberto (ADR-0002).
  function renderRegra(r: RegraPreenchimentoDto, i: number) {
    const itensMenu = itensDeRegraDePreenchimento({ ativo: r.ativo, primeira: i === 0 }, { podeGerir });
    const aoEscolher = (item: AcaoItemAcao) => void aoSelecionar(r, item);
    const aberta = sel === r.id;
    const quando = r.condicoes.map((c) => descreverCondicao(c, nomeConta)).join(" e ");
    const entao = [
      nomeCategoria(r.categoriaId),
      r.centroId && `centro ${opcoes.centros.find((c) => c.id === r.centroId)?.nome ?? "—"}`,
      r.fornecedorId && (contatos[`f:${r.fornecedorId}`] ?? "fornecedor"),
      r.clienteId && (contatos[`c:${r.clienteId}`] ?? "cliente"),
      r.formaId && `forma ${opcoes.formas.find((c) => c.id === r.formaId)?.nome ?? "—"}`,
      r.projetoId && `projeto ${opcoes.projetos.find((c) => c.id === r.projetoId)?.nome ?? "—"}`,
      r.tags.length > 0 && `tags ${r.tags.join(", ")}`,
    ].filter(Boolean);
    return (
      <li key={r.id} className="border-t first:border-t-0">
        <LinhaComMenu
          itens={itensMenu}
          onSelect={aoEscolher}
          render={<div className={`flex items-start gap-2.5 px-3.5 py-3 ${aberta ? "border-l-[3px] border-l-primary bg-muted" : ""} ${r.ativo ? "" : "opacity-70"}`} />}
        >
          <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-muted-foreground" aria-label={`Posição ${i + 1}`}>
            {i + 1}
          </span>
          <button type="button" onClick={() => setSel(r.id)} className="min-w-0 flex-1 text-left" aria-current={aberta ? "true" : undefined}>
            <span className="block text-[13px]">
              <b>Quando</b> {quando}
            </span>
            <span className="block text-[13px]">
              <b>Preenche</b> {entao.length ? entao.join(" · ") : "nada"}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {!r.ativo && <span className="rounded-sm border px-1.5">Pausada</span>}
              {r.usos === 0 ? "nunca usada" : `usada ${r.usos} ${r.usos === 1 ? "vez" : "vezes"}`}
            </span>
          </button>
          <BotaoAcoes itens={itensMenu} onSelect={aoEscolher} rotulo={`Ações da regra ${i + 1}`} className="size-8" />
        </LinhaComMenu>
      </li>
    );
  }
}

/** Seletor de um campo opcional do "Então preencher": "Não preencher" desliga o campo. */
function Campo({ id, rotulo, valor, onChange, itens }: { id: string; rotulo: string; valor: string; onChange: (v: string) => void; itens: Record<string, string> }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select value={valor || NENHUM} onValueChange={(v) => onChange(!v || v === NENHUM ? "" : v)} items={{ [NENHUM]: "Não preencher", ...itens }}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NENHUM}>Não preencher</SelectItem>
          {Object.entries(itens).map(([k, nome]) => (
            <SelectItem key={k} value={k}>
              {nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
