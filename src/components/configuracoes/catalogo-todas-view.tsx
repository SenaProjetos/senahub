"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, Pencil, Plus, Search, Shapes } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { arquivarDisciplinaCatalogo, excluirDisciplinaCatalogo, moverDisciplinaCatalogo, renomearCategoriaDisciplinas } from "@/modules/projetos/actions";
import { definirAtivoSubdisciplina } from "@/modules/projetos/subdisciplinas/actions";
import { excluirSubdisciplina } from "@/modules/projetos/subdisciplinas/actions";
import { definirAtivoItemListaMestre, excluirCatalogoPrancha } from "@/modules/projetos/pranchas/catalogo-actions";
import { alterarCatalogoNaVersao } from "@/modules/projetos/nomenclatura/catalogo/actions";
import {
  ACAO_ARQUIVAR,
  ACAO_DESARQUIVAR,
  ACAO_DESCER,
  ACAO_EXCLUIR,
  ACAO_LOTE_ARQUIVAR,
  ACAO_LOTE_DESARQUIVAR,
  ACAO_LOTE_EXCLUIR,
  ACAO_SUBIR,
} from "@/modules/projetos/acoes-catalogo-disciplina";
import { ACAO_ABRIR_NA_VERSAO, ACAO_EDITAR, itensDaLinhaTodas, itensDoLoteTodas } from "@/modules/projetos/nomenclatura/catalogo/acoes";
import { agruparCards, opcoesDeVersao, SEM_CATEGORIA } from "@/modules/projetos/nomenclatura/catalogo/apresentacao";
import {
  filtrarLinhasTodas,
  filtrarTodas,
  versaoParaAbrir,
  type CardTodas,
  type CatalogoTodas,
  type LinhaTodas,
} from "@/modules/projetos/nomenclatura/catalogo/todas";
import { chaveAlvo, type CatalogoSnap, type OperacaoTela } from "@/modules/projetos/nomenclatura/catalogo/versao";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { BotaoSelecionados } from "@/components/ui/botao-selecionados";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useLote } from "@/components/ui/use-lote";
import { useSelecao } from "@/components/ui/use-selecao";
import { AbasCatalogo } from "@/components/configuracoes/catalogo/abas-catalogo";
import { AdicionarItemDialog } from "@/components/configuracoes/catalogo/adicionar-item-dialog";
import { HistoricoSiglasDialog } from "@/components/configuracoes/catalogo/historico-siglas-dialog";
import { GRADE_TODAS, LinhaTodasItem } from "@/components/configuracoes/catalogo/linha-todas";
import { RenomearCategoriaDialog } from "@/components/configuracoes/catalogo/renomear-categoria-dialog";
import { SeletorVersao } from "@/components/configuracoes/catalogo/seletor-versao";
import { useLapis, type CadastroCard } from "@/components/configuracoes/catalogo/use-lapis";
import { cn } from "@/lib/utils";

export type AbaTodas = "disciplinas" | "fases" | "tipos";

const TODAS_CATEGORIAS = "__todas__";

type VersaoLista = { numero: number; nome: string; publicadaEm: Date | null; sequenciaPor: string };
type Alvo = LinhaTodas["alvo"];

/** Item da lista com tudo que trava excluir (`bloqueio` = uso + documentos + vínculos). */
type Entrada = { linha: LinhaTodas; bloqueio: number; dono?: CardTodas };

export function CatalogoTodasView({
  versoes,
  snap,
  todas,
  cadastro,
  usoSubs,
  usoFases,
  usoDocumentos,
  usoVinculos,
  categorias,
  aba,
  podeGerir,
  podeEditarCard,
}: {
  versoes: VersaoLista[];
  /** Catálogo inteiro, para a prévia de conflito de sigla no navegador (o servidor recalcula). */
  snap: CatalogoSnap;
  todas: CatalogoTodas;
  cadastro: Record<string, CadastroCard>;
  usoSubs: Record<string, number>;
  usoFases: Record<string, number>;
  /** Documentos por fase/tipo (para travar o excluir; a FK solta o documento em silêncio). */
  usoDocumentos: Record<string, number>;
  /** Registros de outras áreas presos a cards e fases (propostas, normas, EAP…). */
  usoVinculos: Record<string, number>;
  categorias: string[];
  aba: AbaTodas;
  podeGerir: boolean;
  podeEditarCard: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const selecao = useSelecao();
  const lote = useLote();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string>(TODAS_CATEGORIAS);
  const [arquivadas, setArquivadas] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [historico, setHistorico] = useState<LinhaTodas | null>(null);
  const lapis = useLapis({ cadastro, categorias, versoes, outroDialogoAberto: adicionando || renomeando !== null || historico !== null });

  const numeros = useMemo(() => versoes.map((x) => x.numero), [versoes]);
  const opcoes = useMemo(() => opcoesDeVersao(versoes), [versoes]);
  const maisNova = opcoes[0]?.numero ?? 1;

  const usoDe = (l: LinhaTodas): number =>
    l.alvo.tipo === "disciplina" ? (cadastro[l.alvo.id]?.uso ?? 0) : l.alvo.tipo === "subdisciplina" ? (usoSubs[l.alvo.id] ?? 0) : (usoFases[l.alvo.id] ?? 0);

  /** Documentos que apontam para o item (fase/tipo) ou para as subs do card; a sub já conta documentos em `usoDe`. */
  const docsDe = (l: LinhaTodas): number => {
    if (l.alvo.tipo === "subdisciplina") return 0;
    if (l.alvo.tipo === "prancha") return usoDocumentos[l.alvo.id] ?? 0;
    const c = todas.cards.find((x) => x.alvo.id === l.alvo.id);
    return (c?.subs ?? []).reduce((n, s) => n + (usoSubs[s.alvo.id] ?? 0), 0);
  };

  /** Quem o perfil pode mexer: card em `projetos:gerir`; sub, fase e tipo em `configuracoes:gerir`. */
  const podeNaLinha = (l: LinhaTodas) => (l.alvo.tipo === "disciplina" ? podeEditarCard : podeGerir);

  // Filtro: busca, categoria, arquivadas — e, no "só selecionados", só o que está marcado.
  const cards = useMemo(() => {
    const base = filtrarTodas(todas.cards, {
      busca,
      categoria: categoria === TODAS_CATEGORIAS ? null : categoria,
      arquivadas,
    });
    if (!selecao.soSelecionados) return base;
    // "Só selecionados": o card se ele ou alguma sub está marcado; as subs mostradas são as marcadas.
    const saida: CardTodas[] = [];
    for (const c of todas.cards) {
      const subs = c.subs.filter((s) => selecao.marcado(chaveAlvo(s.alvo)));
      if (selecao.marcado(chaveAlvo(c.alvo)) || subs.length > 0) saida.push({ ...c, subs });
    }
    return saida;
  }, [todas.cards, busca, categoria, arquivadas, selecao]);
  const grupos = useMemo(() => agruparCards(cards), [cards]);
  const planas = useMemo(
    () => filtrarLinhasTodas(aba === "fases" ? todas.fases : todas.tipos, { busca, arquivadas }),
    [aba, todas.fases, todas.tipos, busca, arquivadas],
  );

  const entradas = useMemo(() => {
    const m = new Map<string, Entrada>();
    const bloqueio = (l: LinhaTodas) => usoDe(l) + docsDe(l) + (usoVinculos[l.alvo.id] ?? 0);
    for (const c of todas.cards) {
      m.set(chaveAlvo(c.alvo), { linha: c, bloqueio: bloqueio(c) });
      for (const s of c.subs) m.set(chaveAlvo(s.alvo), { linha: s, bloqueio: bloqueio(s), dono: c });
    }
    for (const l of [...todas.fases, ...todas.tipos]) m.set(chaveAlvo(l.alvo), { linha: l, bloqueio: bloqueio(l) });
    return m;
    // `usoDe`/`docsDe` leem as mesmas props listadas aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas, cadastro, usoSubs, usoFases, usoDocumentos, usoVinculos]);

  const totalAtivas = todas.cards.filter((c) => c.ativo).length;
  const cardsArquivados = todas.cards.length - totalAtivas;
  // O interruptor revela o que está arquivado NA ABA: cards e subs em Disciplinas; fases ou tipos nas outras.
  const totalArquivadas =
    aba === "disciplinas"
      ? cardsArquivados + todas.cards.reduce((n, c) => n + c.subs.filter((s) => !s.ativo).length, 0)
      : (aba === "fases" ? todas.fases : todas.tipos).filter((l) => !l.ativo).length;

  const hrefAbrir = (l: LinhaTodas) => {
    const n = versaoParaAbrir(l, numeros);
    const sufixo = aba === "disciplinas" ? "" : `?aba=${aba}`;
    return `/configuracoes/nomenclatura/${n}${sufixo}`;
  };

  // ── Ações de uma linha ──────────────────────────────────────────────────────

  function mover(card: CardTodas, vizinho: CardTodas) {
    start(async () => {
      const r = await moverDisciplinaCatalogo({ id: card.alvo.id, vizinhoId: vizinho.alvo.id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function alternarAtivo(l: LinhaTodas) {
    start(async () => {
      const r =
        l.alvo.tipo === "disciplina"
          ? await arquivarDisciplinaCatalogo({ id: l.alvo.id, ativo: !l.ativo })
          : l.alvo.tipo === "subdisciplina"
            ? await definirAtivoSubdisciplina({ id: l.alvo.id, ativo: !l.ativo })
            : await definirAtivoItemListaMestre({ id: l.alvo.id, ativo: !l.ativo });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  const excluirAction = (alvo: Alvo) =>
    alvo.tipo === "disciplina"
      ? excluirDisciplinaCatalogo({ id: alvo.id })
      : alvo.tipo === "subdisciplina"
        ? excluirSubdisciplina({ id: alvo.id })
        : excluirCatalogoPrancha({ id: alvo.id });

  async function excluir(l: LinhaTodas) {
    // O confirm vem ANTES do `start` (dentro dele o React 19 suspende e o diálogo nunca aparece).
    const ok = await confirm({
      title: `Excluir “${l.nome}”?`,
      description:
        l.alvo.tipo === "disciplina"
          ? "A disciplina e as sub-disciplinas dela saem do catálogo em definitivo. Esta ação não pode ser desfeita."
          : "O item sai do catálogo em definitivo. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirAction(l.alvo);
      if (r.ok) {
        toast.success("Excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // ── Lote (aba Disciplinas: cards e subs) ───────────────────────────────────

  const alvosSelecao = useMemo(
    () => [...entradas.entries()].filter(([chave]) => selecao.marcado(chave)).map(([chave, e]) => ({ chave, ...e })),
    [entradas, selecao],
  );
  const itensDoLote = itensDoLoteTodas(alvosSelecao.map((a) => ({ ativo: a.linha.ativo, uso: a.bloqueio })));

  async function executarLote(item: AcaoItemAcao) {
    const rotulo = (chave: string) => entradas.get(chave)?.linha.nome ?? chave;
    const porChave = (chave: string) => entradas.get(chave)!.linha;
    if (item.id === ACAO_LOTE_ARQUIVAR || item.id === ACAO_LOTE_DESARQUIVAR) {
      const arquivando = item.id === ACAO_LOTE_ARQUIVAR;
      // Só entram os que estão no estado de partida certo; cada um grava o estado pedido (tela velha não inverte).
      await lote.executar({
        ids: alvosSelecao.filter((a) => a.linha.ativo === arquivando).map((a) => a.chave),
        acao: async (chave) => {
          const l = porChave(chave);
          return l.alvo.tipo === "disciplina"
            ? arquivarDisciplinaCatalogo({ id: l.alvo.id, ativo: !arquivando })
            : definirAtivoSubdisciplina({ id: l.alvo.id, ativo: !arquivando });
        },
        substantivo: ["item", "itens"],
        verbo: arquivando ? ["arquivado", "arquivados"] : ["desarquivado", "desarquivados"],
        rotulo,
        aoConcluir: selecao.limpar,
      });
    } else if (item.id === ACAO_LOTE_EXCLUIR) {
      // Subs antes dos cards: excluir o card leva as subs junto e a exclusão da sub falharia.
      const livres = alvosSelecao.filter((a) => a.bloqueio === 0).sort((a, b) => Number(a.linha.alvo.tipo === "disciplina") - Number(b.linha.alvo.tipo === "disciplina"));
      const emUso = alvosSelecao.length - livres.length;
      await lote.executar({
        ids: livres.map((a) => a.chave),
        acao: (chave) => excluirAction(porChave(chave).alvo),
        substantivo: ["item", "itens"],
        verbo: ["excluído", "excluídos"],
        rotulo,
        confirmar: {
          titulo: (n) => `Excluir ${n} ${n === 1 ? "item" : "itens"}?`,
          descricao:
            emUso > 0
              ? `${item.confirmar?.descricao ?? ""} ${emUso} ${emUso === 1 ? "está" : "estão"} em uso e ${emUso === 1 ? "fica" : "ficam"} de fora — arquive.`.trim()
              : item.confirmar?.descricao,
          rotuloConfirmar: item.confirmar?.rotuloConfirmar,
          destrutivo: true,
        },
        aoConcluir: selecao.limpar,
      });
    }
  }

  /** Menu de uma linha; com 2+ marcadas e a linha entre elas, o menu é o do lote. */
  function menuDe(l: LinhaTodas, reordenar?: { pode: boolean; temCima: boolean; temBaixo: boolean }): AcaoItem[] {
    if (alvosSelecao.length > 1 && selecao.marcado(chaveAlvo(l.alvo))) return itensDoLote;
    return itensDaLinhaTodas(l, {
      podeGerir,
      podeEditarCard,
      versaoAbrir: versaoParaAbrir(l, numeros),
      uso: usoDe(l),
      usoDocumentos: docsDe(l),
      usoVinculos: usoVinculos[l.alvo.id] ?? 0,
      reordenar,
    });
  }

  function aoSelecionar(l: LinhaTodas, acao: AcaoItemAcao, vizinhos?: { cima: CardTodas | null; baixo: CardTodas | null }) {
    lapis.cancelar();
    if (acao.id.startsWith("lote-")) void executarLote(acao);
    else if (acao.id === ACAO_EDITAR) lapis.abrir(l.alvo, l.nome);
    else if (acao.id === ACAO_ABRIR_NA_VERSAO) router.push(hrefAbrir(l));
    else if (acao.id === ACAO_SUBIR && vizinhos?.cima) mover(l as CardTodas, vizinhos.cima);
    else if (acao.id === ACAO_DESCER && vizinhos?.baixo) mover(l as CardTodas, vizinhos.baixo);
    else if (acao.id === ACAO_ARQUIVAR || acao.id === ACAO_DESARQUIVAR) alternarAtivo(l);
    else if (acao.id === ACAO_EXCLUIR) void excluir(l);
  }

  function renomearCategoria(de: string, para: string) {
    start(async () => {
      const r = await renomearCategoriaDisciplinas({ de, para: para.trim() });
      if (r.ok) {
        toast.success(para.trim() ? "Categoria renomeada." : "Categoria removida — as disciplinas foram para “Outras”.");
        setRenomeando(null);
        if (categoria === de) setCategoria(TODAS_CATEGORIAS); // o filtro apontava para um grupo que não existe mais
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function adicionar(op: OperacaoTela, transferencias: string[], versao: number) {
    start(async () => {
      const r = await alterarCatalogoNaVersao({ versao, operacoes: [op], transferencias });
      if (r.ok) {
        toast.success(
          r.data.transferidas > 0 ? `Adicionado à v${versao}. A sigla saiu do outro item a partir da v${versao}.` : `Adicionado à v${versao}.`,
        );
        setAdicionando(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const novo =
    aba === "fases"
      ? { rotulo: "Fase", titulo: "Nova fase", montar: (nome: string, sigla: string | null): OperacaoTela => ({ tipo: "item-novo", categoria: "fase", nome, sigla: sigla ?? "" }), sigla: true }
      : aba === "tipos"
        ? { rotulo: "Tipo", titulo: "Novo tipo", montar: (nome: string, sigla: string | null): OperacaoTela => ({ tipo: "item-novo", categoria: "tipo", nome, sigla: sigla ?? "" }), sigla: true }
        : { rotulo: "Disciplina", titulo: "Nova disciplina (card)", montar: (nome: string, sigla: string | null): OperacaoTela => ({ tipo: "card-novo", nome, sigla }), sigla: false };

  const filtrando = busca.trim() !== "" || categoria !== TODAS_CATEGORIAS;
  const podeReordenar = !busca.trim() && !selecao.soSelecionados;
  const idsVisiveis = grupos.flatMap((g) => g.cards.flatMap((c) => [c, ...c.subs])).filter((l) => podeNaLinha(l)).map((l) => chaveAlvo(l.alvo));
  const semNada = aba === "disciplinas" ? grupos.length === 0 : planas.length === 0;
  const ocupado = pending || lapis.ocupado || lote.pendente;

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Disciplinas e nomenclatura"
        descricao="Catálogo do padrão de nome de arquivo, versão por versão."
        trilha={[
          { href: "/", label: "Início" },
          { href: "/configuracoes", label: "Configurações" },
        ]}
        acoes={
          podeGerir ? (
            <>
              <Button size="sm" disabled={ocupado} onClick={() => setAdicionando(true)}>
                <Plus className="size-4" /> {novo.rotulo}
              </Button>
              <Button size="sm" variant="outline" render={<Link href="/configuracoes/nomenclatura/versoes" />}>
                <Layers className="size-4" /> Versões
              </Button>
            </>
          ) : undefined
        }
      />

      <SeletorVersao opcoes={opcoes} atual="todas" aba={aba} />
      <AbasCatalogo lente="todas" aba={aba} podeGerir={podeGerir} />

      <p className="rounded-sm border bg-muted/40 p-3 text-sm">
        Aqui fica o cadastro: nome, ícone, categoria, ordem, arquivar. Siglas e o que entra em cada versão mudam dentro da versão —{" "}
        <Link href={`/configuracoes/nomenclatura/${maisNova}`} className="text-primary hover:underline">
          abrir a v{maisNova}
        </Link>
        .
      </p>

      <DicaMenuContexto />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-2.5 size-4 text-muted-foreground" />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome ou sigla"
            aria-label="Buscar por nome ou sigla"
            className="pl-8"
          />
        </div>
        {aba === "disciplinas" && (
          <Select value={categoria} onValueChange={(v) => setCategoria(v ?? TODAS_CATEGORIAS)}>
            <SelectTrigger className="w-48" aria-label="Filtrar por categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS_CATEGORIAS}>Todas as categorias</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
              {todas.cards.some((c) => !c.categoria) && <SelectItem value={SEM_CATEGORIA}>{SEM_CATEGORIA}</SelectItem>}
            </SelectContent>
          </Select>
        )}
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={arquivadas} onCheckedChange={setArquivadas} />
          Arquivadas ({totalArquivadas})
        </label>
        {aba === "disciplinas" && <BotaoSelecionados total={selecao.total} ativo={selecao.soSelecionados} onChange={selecao.verSelecionados} />}
      </div>

      <Card>
        <CardContent className="p-0">
          {semNada ? (
            <div className="p-6">
              <EmptyState
                icon={Shapes}
                title={filtrando || arquivadas ? "Nada encontrado" : aba === "disciplinas" ? "Nenhuma disciplina no cadastro" : aba === "fases" ? "Nenhuma fase" : "Nenhum tipo"}
                description={filtrando ? "Ajuste a busca ou os filtros." : podeGerir ? "Adicione o primeiro item pelo botão no topo." : "Nada cadastrado ainda."}
              />
            </div>
          ) : aba === "disciplinas" ? (
            <div>
              <div
                className={cn(
                  "hidden items-center gap-x-3 border-b bg-muted/40 py-2.5 pl-4 pr-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground",
                  GRADE_TODAS,
                )}
              >
                <Checkbox
                  checked={selecao.estadoDaPagina(idsVisiveis) === "todos"}
                  onCheckedChange={() => selecao.alternarPagina(idsVisiveis)}
                  aria-label="Marcar todas as linhas da lista"
                />
                <span>Disciplina</span>
                <span />
                <span>Existe em</span>
                <span>Siglas (todas as versões)</span>
                <span>Em uso</span>
                <span />
              </div>
              {grupos.map((g) => (
                <Fragment key={g.categoria}>
                  <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {g.categoria}
                      {podeEditarCard && g.categoria !== SEM_CATEGORIA && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title={`Renomear a categoria ${g.categoria}`}
                          aria-label={`Renomear a categoria ${g.categoria}`}
                          onClick={() => setRenomeando(g.categoria)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{g.cards.length}</span>
                  </div>
                  {g.cards.map((c, i) => {
                    const vizinhos = { cima: g.cards[i - 1] ?? null, baixo: g.cards[i + 1] ?? null };
                    const reordenar = { pode: podeReordenar, temCima: !!vizinhos.cima, temBaixo: !!vizinhos.baixo };
                    return (
                      <Fragment key={c.alvo.id}>
                        <LinhaTodasItem
                          linha={c}
                          usoRotulo={usoDe(c) > 0 ? `${usoDe(c)} proj.` : null}
                          usoHref={usoDe(c) > 0 ? `/projetos?disciplina=${encodeURIComponent(c.nome)}` : undefined}
                          selecionavel={podeNaLinha(c)}
                          marcado={selecao.marcado(chaveAlvo(c.alvo))}
                          onAlternar={() => selecao.alternar(chaveAlvo(c.alvo))}
                          aoAbrirMenu={(aberto) => aberto && selecao.aoAbrirMenu(chaveAlvo(c.alvo))}
                          menuItens={menuDe(c, reordenar)}
                          onSelect={(acao) => aoSelecionar(c, acao, vizinhos)}
                          onVerSiglas={() => setHistorico(c)}
                          pending={ocupado}
                        />
                        {c.subs.map((s) => (
                          <LinhaTodasItem
                            key={s.alvo.id}
                            linha={s}
                            donoNome={c.nome}
                            usoRotulo={null}
                            selecionavel={podeNaLinha(s)}
                            marcado={selecao.marcado(chaveAlvo(s.alvo))}
                            onAlternar={() => selecao.alternar(chaveAlvo(s.alvo))}
                            aoAbrirMenu={(aberto) => aberto && selecao.aoAbrirMenu(chaveAlvo(s.alvo))}
                            menuItens={menuDe(s)}
                            onSelect={(acao) => aoSelecionar(s, acao)}
                            onVerSiglas={() => setHistorico(s)}
                            pending={ocupado}
                          />
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          ) : (
            <div>
              {planas.map((l) => (
                <LinhaTodasItem
                  key={l.alvo.id}
                  linha={l}
                  usoRotulo={aba === "fases" && usoDe(l) > 0 ? `${usoDe(l)} ${usoDe(l) === 1 ? "etapa" : "etapas"}` : null}
                  selecionavel={false}
                  marcado={false}
                  onAlternar={() => {}}
                  aoAbrirMenu={() => {}}
                  menuItens={menuDe(l)}
                  onSelect={(acao) => aoSelecionar(l, acao)}
                  onVerSiglas={() => setHistorico(l)}
                  pending={ocupado}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {aba === "disciplinas" ? (
          <>
            {totalAtivas} {totalAtivas === 1 ? "disciplina ativa" : "disciplinas ativas"} · {cardsArquivados}{" "}
            {cardsArquivados === 1 ? "arquivada" : "arquivadas"}
            {!arquivadas && cardsArquivados > 0 ? " (ocultas)" : ""}.{podeEditarCard || podeGerir ? " Selecione várias para arquivar ou excluir de uma vez." : ""}
          </>
        ) : (
          "Arquivar tira o item dos cadastros novos; excluir só vale para o que ninguém usa."
        )}
      </p>

      {aba === "disciplinas" && (
        <BarraSelecao
          total={alvosSelecao.length}
          itens={itensDoLote}
          onSelect={(item) => {
            lapis.cancelar();
            void executarLote(item);
          }}
          onLimpar={selecao.limpar}
          substantivo={["item", "itens"]}
          genero="m"
          progresso={lote.progresso}
        />
      )}
      {lote.portal}

      {adicionando && (
        <AdicionarItemDialog
          titulo={novo.titulo}
          siglaObrigatoria={novo.sigla}
          montar={novo.montar}
          snap={snap}
          versao={maisNova}
          versoes={numeros}
          opcoesVersao={opcoes}
          pending={pending}
          onFechar={() => setAdicionando(false)}
          onSalvar={adicionar}
        />
      )}
      {renomeando && (
        <RenomearCategoriaDialog
          categoria={renomeando}
          quantas={todas.cards.filter((c) => c.categoria === renomeando).length}
          pending={pending}
          onSalvar={(novoNome) => renomearCategoria(renomeando, novoNome)}
          onFechar={() => setRenomeando(null)}
        />
      )}
      {historico && (
        <HistoricoSiglasDialog
          linha={historico}
          hrefAbrir={hrefAbrir(historico)}
          versaoAbrir={versaoParaAbrir(historico, numeros)}
          onFechar={() => setHistorico(null)}
        />
      )}
      {lapis.dialogo}
    </div>
  );
}
