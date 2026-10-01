"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Layers, Plus, Search, Shapes, Undo2 } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { alterarCatalogoNaVersao } from "@/modules/projetos/nomenclatura/catalogo/actions";
import { editarCadastroDisciplina } from "@/modules/projetos/actions";
import { editarNomeSubdisciplina } from "@/modules/projetos/subdisciplinas/actions";
import { editarNomeItemListaMestre } from "@/modules/projetos/pranchas/catalogo-actions";
import {
  ACAO_ADICIONAR_SUB,
  ACAO_EDITAR,
  ACAO_SIGLAS,
  ACAO_TIRAR,
  itensDaLinhaCatalogo,
} from "@/modules/projetos/nomenclatura/catalogo/acoes";
import { fraseTirarCardEmUso } from "@/modules/projetos/nomenclatura/catalogo/versao";
import { agruparCards, filtrarCatalogo, filtrarLinhas, opcoesDeVersao } from "@/modules/projetos/nomenclatura/catalogo/apresentacao";
import type {
  AlvoCatalogo,
  CatalogoNaVersao,
  CatalogoSnap,
  LinhaCatalogo,
  OperacaoTela,
  SaiNaVersao,
} from "@/modules/projetos/nomenclatura/catalogo/versao";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { ImportarCatalogoDialog } from "@/components/configuracoes/importar-catalogo-dialog";
import { AdicionarItemDialog } from "@/components/configuracoes/catalogo/adicionar-item-dialog";
import { EditarCardDialog, EditarNomeDialog, type PayloadCadastroCard } from "@/components/configuracoes/catalogo/editar-cadastro-dialog";
import { LinhaCatalogoItem } from "@/components/configuracoes/catalogo/linha-catalogo";
import { SeletorVersao } from "@/components/configuracoes/catalogo/seletor-versao";
import { SiglasNaVersaoDialog } from "@/components/configuracoes/catalogo/siglas-na-versao-dialog";
import { SiglaOficial, SiglaSinonimo } from "@/components/configuracoes/catalogo/sigla-chips";
import { VoltarVersaoDialog } from "@/components/configuracoes/catalogo/voltar-versao-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AbaCatalogo = "disciplinas" | "fases" | "tipos";

/** O que o lápis do card precisa e a tabela da versão não traz. */
export type CadastroCard = {
  codigo: string | null;
  categoria: string | null;
  icone: string | null;
  iconeSvg: string | null;
  numeracao: number | null;
  numeracaoFim: number | null;
  uso: number;
  versaoDesde: number;
  versaoAte: number | null;
};

type VersaoResumo = { numero: number; nome: string; publicada: boolean };
type VersaoLista = { numero: number; nome: string; publicadaEm: Date | null; sequenciaPor: string };

/** Diálogo aberto: adicionar, siglas de um item, voltar um item que saiu, ou o lápis do cadastro. */
type Dialogo =
  | { tipo: "adicionar"; titulo: string; siglaObrigatoria: boolean; montar: (nome: string, sigla: string | null) => OperacaoTela }
  | { tipo: "siglas"; rotulo: string; alvo: AlvoCatalogo }
  | { tipo: "voltar"; nome: string; alvo: AlvoCatalogo }
  | { tipo: "editar"; nome: string; alvo: AlvoCatalogo };

const ABAS: { valor: AbaCatalogo; rotulo: string }[] = [
  { valor: "disciplinas", rotulo: "Disciplinas" },
  { valor: "fases", rotulo: "Fases" },
  { valor: "tipos", rotulo: "Tipos de documento" },
];

const ACAO_IMPORTAR = "importar";

/** "Versões" leva à página de versões (`configuracoes:gerir`); quem não administra vê só o nome, sem link quebrado. */
function LinkVersoes({ podeGerir }: { podeGerir: boolean }) {
  if (!podeGerir) return <span className="font-medium">Versões</span>;
  return (
    <Link href="/configuracoes/nomenclatura/versoes" className="text-primary hover:underline">
      Versões
    </Link>
  );
}

export function CatalogoVersaoView({
  versao,
  versoes,
  catalogo,
  snap,
  cadastro,
  categorias,
  aba,
  podeGerir,
  podeEditarCard,
  podeVerCadastro,
}: {
  versao: VersaoResumo & { projetosFixados: number };
  versoes: VersaoLista[];
  catalogo: CatalogoNaVersao;
  /** Catálogo inteiro, para a prévia de conflito de sigla no navegador (o servidor recalcula). */
  snap: CatalogoSnap;
  cadastro: Record<string, CadastroCard>;
  categorias: string[];
  aba: AbaCatalogo;
  podeGerir: boolean;
  podeEditarCard: boolean;
  podeVerCadastro: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [importando, setImportando] = useState(false);
  const [busca, setBusca] = useState("");
  const v = versao.numero;
  // Memorizados: entram nas dependências da prévia de conflito dos diálogos.
  const numeros = useMemo(() => versoes.map((x) => x.numero), [versoes]);
  const opcoes = useMemo(() => opcoesDeVersao(versoes), [versoes]);
  const totalSubs = catalogo.cards.reduce((n, c) => n + c.subs.length, 0);

  const grupos = useMemo(() => agruparCards(filtrarCatalogo(catalogo.cards, busca)), [catalogo.cards, busca]);
  const fases = useMemo(() => filtrarLinhas(catalogo.fases, busca), [catalogo.fases, busca]);
  const tipos = useMemo(() => filtrarLinhas(catalogo.tipos, busca), [catalogo.tipos, busca]);

  function executar(operacoes: OperacaoTela[], transferencias: string[], sucesso: string) {
    start(async () => {
      const r = await alterarCatalogoNaVersao({ versao: v, operacoes, transferencias });
      if (r.ok) {
        toast.success(r.data.transferidas > 0 ? `${sucesso} A sigla saiu do outro item a partir da v${v}.` : sucesso);
        setDialogo(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function tirar(linha: LinhaCatalogo) {
    const ok = await confirm({
      title: `Tirar “${linha.nome}” da v${v}?`,
      description:
        `Deixa de existir a partir da v${v} e segue valendo nas versões anteriores (se foi criado na própria v${v}, é excluído). ` +
        "Projetos que já o usam não mudam.",
      confirmLabel: "Tirar da versão",
    });
    if (!ok) return;
    executar([{ tipo: "sai", alvo: linha.alvo }], [], `“${linha.nome}” saiu da v${v}.`);
  }

  /** Lápis: grava só o cadastro (nada de versão) e recarrega a lista. */
  function gravarCadastro(chamada: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>) {
    start(async () => {
      const r = await chamada();
      if (r.ok) {
        toast.success("Cadastro atualizado.");
        setDialogo(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const menuDe = (linha: LinhaCatalogo): AcaoItem[] => {
    // Card criado nesta versão que já tem projeto: "tirar" seria excluir, e o servidor recusa — o menu
    // já mostra o item inerte, com a mesma frase (ADR-0002, regra 5).
    const c = linha.alvo.tipo === "disciplina" ? cadastro[linha.alvo.id] : undefined;
    const motivoTirar = c && c.versaoDesde >= v && c.uso > 0 ? fraseTirarCardEmUso(linha.nome, c.uso) : null;
    return itensDaLinhaCatalogo(linha, { podeGerir, podeEditarCard, versao: v, motivoTirar });
  };

  function aoSelecionar(linha: LinhaCatalogo, acao: AcaoItemAcao) {
    if (acao.id === ACAO_SIGLAS) setDialogo({ tipo: "siglas", rotulo: linha.nome, alvo: linha.alvo });
    else if (acao.id === ACAO_ADICIONAR_SUB) {
      setDialogo({
        tipo: "adicionar",
        titulo: `Nova sub-disciplina em ${linha.nome} (v${v})`,
        siglaObrigatoria: false,
        montar: (nome, sigla) => ({ tipo: "sub-nova", cardId: linha.alvo.id, nome, sigla }),
      });
    } else if (acao.id === ACAO_EDITAR) setDialogo({ tipo: "editar", nome: linha.nome, alvo: linha.alvo });
    else if (acao.id === ACAO_TIRAR) void tirar(linha);
  }

  function renderLinha(linha: LinhaCatalogo) {
    return (
      <LinhaCatalogoItem
        linha={linha}
        versao={v}
        menuItens={menuDe(linha)}
        onSelect={(acao) => aoSelecionar(linha, acao)}
        pending={pending}
      />
    );
  }

  // O "+ …" do cabeçalho segue a aba.
  const novo =
    aba === "fases"
      ? { rotulo: "Fase", titulo: `Nova fase na v${v}`, montar: (nome: string, sigla: string | null): OperacaoTela => ({ tipo: "item-novo", categoria: "fase", nome, sigla: sigla ?? "" }), sigla: true }
      : aba === "tipos"
        ? { rotulo: "Tipo", titulo: `Novo tipo na v${v}`, montar: (nome: string, sigla: string | null): OperacaoTela => ({ tipo: "item-novo", categoria: "tipo", nome, sigla: sigla ?? "" }), sigla: true }
        : { rotulo: "Disciplina", titulo: `Nova disciplina (card) na v${v}`, montar: (nome: string, sigla: string | null): OperacaoTela => ({ tipo: "card-novo", nome, sigla }), sigla: false };
  const acoesCabecalho: AcaoItem[] = podeGerir ? [{ tipo: "acao", id: ACAO_IMPORTAR, rotulo: "Importar planilha", icone: FileUp }] : [];

  const saem = catalogo.saem.filter((l) =>
    aba === "disciplinas" ? l.alvo.tipo !== "prancha" : l.alvo.tipo === "prancha" && l.tipoRotulo === (aba === "fases" ? "Fase" : "Tipo"),
  );

  const dialogoCard = dialogo?.tipo === "editar" && dialogo.alvo.tipo === "disciplina" ? cadastro[dialogo.alvo.id] : undefined;

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
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  setDialogo({ tipo: "adicionar", titulo: novo.titulo, siglaObrigatoria: novo.sigla, montar: novo.montar })
                }
              >
                <Plus className="size-4" /> {novo.rotulo}
              </Button>
              <Button size="sm" variant="outline" render={<Link href="/configuracoes/nomenclatura/versoes" />}>
                <Layers className="size-4" /> Versões
              </Button>
              <BotaoAcoes
                itens={acoesCabecalho}
                onSelect={(a) => a.id === ACAO_IMPORTAR && setImportando(true)}
                rotulo="Mais ações: importar planilha"
                className="size-8"
              />
            </>
          ) : undefined
        }
      />

      <SeletorVersao opcoes={opcoes} atual={v} aba={aba} mostrarTodas={podeVerCadastro} />

      <nav aria-label="Seções do catálogo" className="flex flex-wrap gap-1 border-b">
        {ABAS.map((a) => (
          <Link
            key={a.valor}
            href={`/configuracoes/nomenclatura/${v}?aba=${a.valor}`}
            aria-current={a.valor === aba ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3.5 py-2.5 text-sm",
              a.valor === aba ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>

      <p className="rounded-sm border bg-muted/40 p-3 text-sm">
        {versao.publicada ? (
          <>
            A <strong>v{v} — {versao.nome}</strong> está publicada
            {versao.projetosFixados > 0 ? ` e ${versao.projetosFixados} projeto(s) seguem ela` : ""}: o que mudar aqui vale
            para esses projetos também. Uma mudança que não deve afetá-los vai numa versão nova, criada em{" "}
            <LinkVersoes podeGerir={podeGerir} />
            .
          </>
        ) : (
          <>
            A <strong>v{v} — {versao.nome}</strong> é rascunho: nada daqui vale para projeto nenhum até ela ser publicada em{" "}
            <LinkVersoes podeGerir={podeGerir} />
            .
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {catalogo.cards.length} disciplina(s) · {totalSubs} sub-disciplina(s) · {catalogo.fases.length} fase(s) ·{" "}
          {catalogo.tipos.length} tipo(s)
          {v > 1 &&
            ` — em relação à v${v - 1}: ${catalogo.resumo.entram} entram, ${catalogo.resumo.saem} saem, ${catalogo.resumo.siglasNovas} sigla(s) nova(s).`}
        </p>
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
      </div>

      {aba === "disciplinas" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Disciplinas</CardTitle>
            <p className="text-xs text-muted-foreground">
              CARD abre disciplina no projeto (projetista, prazo, pagamento). SUB é só etiqueta do documento, lida do nome do
              arquivo, dentro do card.
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <SiglaOficial sigla="HID" /> oficial, vai no nome
              <span className="ml-2" />
              <SiglaSinonimo sigla="HDR" /> sinônimo, só reconhecido
            </p>
          </CardHeader>
          <CardContent>
            {grupos.length === 0 ? (
              <EmptyState
                icon={Shapes}
                title={busca ? "Nada encontrado" : `Nenhuma disciplina na v${v}`}
                description={busca ? "Ajuste a busca." : "Importe a planilha ou adicione uma disciplina."}
              />
            ) : (
              grupos.map((g) => (
                <section key={g.categoria} aria-label={g.categoria}>
                  <h3 className="pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{g.categoria}</h3>
                  <ul className="divide-y border-t">
                    {g.cards.map((c) => (
                      <li key={c.alvo.id}>
                        {renderLinha(c)}
                        {c.subs.length > 0 && (
                          <ul className="ml-3 divide-y border-l pl-3 sm:ml-5">
                            {c.subs.map((s) => (
                              <li key={s.alvo.id}>{renderLinha(s)}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{aba === "fases" ? "Fases" : "Tipos de documento"}</CardTitle>
          </CardHeader>
          <CardContent>
            {(aba === "fases" ? fases : tipos).length === 0 ? (
              <EmptyState
                icon={Shapes}
                title={busca ? "Nada encontrado" : `Nenhum${aba === "fases" ? "a fase" : " tipo"} nesta versão`}
                description={busca ? "Ajuste a busca." : "Adicione pelo botão do topo."}
              />
            ) : (
              <ul className="divide-y">
                {(aba === "fases" ? fases : tipos).map((l) => (
                  <li key={l.alvo.id}>{renderLinha(l)}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {saem.length > 0 && (
        <CollapsibleSection
          titulo={`Saem na v${v}`}
          descricao={`Existiam na v${v - 1} e não existem nesta. Continuam valendo nas versões anteriores.`}
          resumo={<Badge variant="outline">{saem.length}</Badge>}
          defaultOpen
        >
          <ul className="divide-y">
            {saem.map((l: SaiNaVersao) => (
              <li key={l.alvo.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  {l.nome} <span className="text-xs text-muted-foreground">· {l.tipoRotulo}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {l.sigla && <SiglaOficial sigla={l.sigla} />}
                  {l.sinonimos.map((s) => (
                    <SiglaSinonimo key={s} sigla={s} />
                  ))}
                </span>
                {podeGerir && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDialogo({ tipo: "voltar", nome: l.nome, alvo: l.alvo })}>
                    <Undo2 className="size-3.5" /> Voltar para a v{v}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {dialogo?.tipo === "adicionar" && (
        <AdicionarItemDialog
          titulo={dialogo.titulo}
          siglaObrigatoria={dialogo.siglaObrigatoria}
          montar={dialogo.montar}
          snap={snap}
          versao={v}
          versoes={numeros}
          pending={pending}
          onFechar={() => setDialogo(null)}
          onSalvar={(op, transferencias) => executar([op], transferencias, `Adicionado à v${v}.`)}
        />
      )}
      {dialogo?.tipo === "siglas" && (
        <SiglasNaVersaoDialog
          snap={snap}
          versao={v}
          versoes={numeros}
          alvo={dialogo.alvo}
          rotulo={dialogo.rotulo}
          pending={pending}
          onFechar={() => setDialogo(null)}
          onSalvar={(ops, transferencias) => executar(ops, transferencias, `Siglas de “${dialogo.rotulo}” na v${v} salvas.`)}
        />
      )}
      {dialogo?.tipo === "voltar" && (
        <VoltarVersaoDialog
          snap={snap}
          versao={v}
          versoes={numeros}
          alvo={dialogo.alvo}
          nome={dialogo.nome}
          pending={pending}
          onFechar={() => setDialogo(null)}
          onSalvar={(op, transferencias) => executar([op], transferencias, `“${dialogo.nome}” voltou para a v${v}.`)}
        />
      )}
      {dialogo?.tipo === "editar" && dialogoCard && (
        <EditarCardDialog
          card={{ id: dialogo.alvo.id, nome: dialogo.nome, ...dialogoCard }}
          categorias={categorias}
          versoes={versoes}
          pending={pending}
          onFechar={() => setDialogo(null)}
          onSalvar={(p: PayloadCadastroCard) => gravarCadastro(() => editarCadastroDisciplina(p))}
        />
      )}
      {dialogo?.tipo === "editar" && dialogo.alvo.tipo !== "disciplina" && (
        <EditarNomeDialog
          titulo={`Editar cadastro — ${dialogo.nome}`}
          nome={dialogo.nome}
          pending={pending}
          onFechar={() => setDialogo(null)}
          onSalvar={(nome) =>
            gravarCadastro(() =>
              dialogo.alvo.tipo === "subdisciplina"
                ? editarNomeSubdisciplina({ id: dialogo.alvo.id, nome })
                : editarNomeItemListaMestre({ id: dialogo.alvo.id, nome }),
            )
          }
        />
      )}
      <ImportarCatalogoDialog aberto={importando} versao={v} onFechar={() => setImportando(false)} />
    </div>
  );
}
