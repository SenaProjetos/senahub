"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleMinus, FileUp, Plus, Shapes, Tags, Undo2 } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { alterarCatalogoNaVersao } from "@/modules/projetos/nomenclatura/catalogo/actions";
import type {
  AlvoCatalogo,
  CatalogoNaVersao,
  CatalogoSnap,
  LinhaCatalogo,
  OperacaoTela,
} from "@/modules/projetos/nomenclatura/catalogo/versao";
import { ImportarCatalogoDialog } from "@/components/configuracoes/importar-catalogo-dialog";
import { AdicionarItemDialog } from "@/components/configuracoes/catalogo/adicionar-item-dialog";
import { SiglasNaVersaoDialog } from "@/components/configuracoes/catalogo/siglas-na-versao-dialog";
import { VoltarVersaoDialog } from "@/components/configuracoes/catalogo/voltar-versao-dialog";
import { SiglaOficial, SiglaSinonimo } from "@/components/configuracoes/catalogo/sigla-chips";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

type VersaoResumo = { numero: number; nome: string; publicada: boolean };

/** Diálogo aberto: adicionar (card, sub, fase, tipo), siglas de um item, ou voltar um item que saiu. */
type Dialogo =
  | { tipo: "adicionar"; titulo: string; siglaObrigatoria: boolean; montar: (nome: string, sigla: string | null) => OperacaoTela }
  | { tipo: "siglas"; rotulo: string; alvo: AlvoCatalogo }
  | { tipo: "voltar"; nome: string; alvo: AlvoCatalogo };

const ESTRUTURA: Record<AlvoCatalogo["tipo"], string> = { disciplina: "CARD", subdisciplina: "SUB", prancha: "" };

export function CatalogoVersaoView({
  versao,
  versoes,
  catalogo,
  snap,
}: {
  versao: VersaoResumo & { projetosFixados: number };
  versoes: VersaoResumo[];
  catalogo: CatalogoNaVersao;
  /** Catálogo inteiro, para a prévia de conflito de sigla no navegador (o servidor recalcula). */
  snap: CatalogoSnap;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [importando, setImportando] = useState(false);
  const v = versao.numero;
  // Memorizado: entra nas dependências da prévia de conflito dos diálogos.
  const numeros = useMemo(() => versoes.map((x) => x.numero), [versoes]);
  const totalSubs = catalogo.cards.reduce((n, c) => n + c.subs.length, 0);

  function executar(operacoes: OperacaoTela[], transferir: boolean, sucesso: string) {
    start(async () => {
      const r = await alterarCatalogoNaVersao({ versao: v, operacoes, transferir });
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
    executar([{ tipo: "sai", alvo: linha.alvo }], false, `“${linha.nome}” saiu da v${v}.`);
  }

  const acoesLinha = {
    pending,
    versao: v,
    onSiglas: (l: LinhaCatalogo) => setDialogo({ tipo: "siglas", rotulo: l.nome, alvo: l.alvo }),
    onTirar: (l: LinhaCatalogo) => void tirar(l),
  };

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo={`Catálogo da v${v}`}
        descricao="Disciplinas, sub-disciplinas, fases e tipos desta versão do padrão, como na planilha."
        trilha={[
          { href: "/", label: "Início" },
          { href: "/configuracoes", label: "Configurações" },
          { href: "/configuracoes/nomenclatura", label: "Nomenclatura" },
        ]}
        acoes={
          <>
            <Button size="sm" onClick={() => setImportando(true)} disabled={pending}>
              <FileUp className="size-4" /> Importar planilha
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                setDialogo({
                  tipo: "adicionar",
                  titulo: `Nova disciplina (card) na v${v}`,
                  siglaObrigatoria: false,
                  montar: (nome, sigla) => ({ tipo: "card-novo", nome, sigla }),
                })
              }
            >
              <Plus className="size-4" /> Disciplina
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Versão:</span>
        {versoes.map((x) => (
          <Button
            key={x.numero}
            size="xs"
            variant={x.numero === v ? "secondary" : "outline"}
            aria-current={x.numero === v ? "page" : undefined}
            render={<Link href={`/configuracoes/nomenclatura/${x.numero}`} />}
          >
            v{x.numero}
            {!x.publicada && <span className="text-muted-foreground"> (rascunho)</span>}
          </Button>
        ))}
      </div>

      <p className="rounded-sm border bg-muted/40 p-3 text-sm">
        {versao.publicada ? (
          <>
            A <strong>v{v} — {versao.nome}</strong> está publicada
            {versao.projetosFixados > 0 ? ` e ${versao.projetosFixados} projeto(s) seguem ela` : ""}: o que mudar aqui vale
            para esses projetos também. Uma mudança que não deve afetá-los vai numa versão nova, criada em{" "}
            <Link href="/configuracoes/nomenclatura" className="text-primary hover:underline">
              Nomenclatura
            </Link>
            .
          </>
        ) : (
          <>
            A <strong>v{v} — {versao.nome}</strong> é rascunho: nada daqui vale para projeto nenhum até ela ser publicada em{" "}
            <Link href="/configuracoes/nomenclatura" className="text-primary hover:underline">
              Nomenclatura
            </Link>
            .
          </>
        )}
      </p>

      <p className="text-sm text-muted-foreground">
        {catalogo.cards.length} disciplina(s) · {totalSubs} sub-disciplina(s) · {catalogo.fases.length} fase(s) ·{" "}
        {catalogo.tipos.length} tipo(s)
        {v > 1 &&
          ` — em relação à v${v - 1}: ${catalogo.resumo.entram} entram, ${catalogo.resumo.saem} saem, ${catalogo.resumo.siglasNovas} sigla(s) nova(s).`}
      </p>

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
          {catalogo.cards.length === 0 ? (
            <EmptyState icon={Shapes} title={`Nenhuma disciplina na v${v}`} description="Importe a planilha ou adicione uma disciplina." />
          ) : (
            <ul className="divide-y">
              {catalogo.cards.map((c) => (
                <li key={c.alvo.id} className="py-1">
                  <LinhaItem
                    linha={c}
                    {...acoesLinha}
                    onAdicionarSub={() =>
                      setDialogo({
                        tipo: "adicionar",
                        titulo: `Nova sub-disciplina em ${c.nome} (v${v})`,
                        siglaObrigatoria: false,
                        montar: (nome, sigla) => ({ tipo: "sub-nova", cardId: c.alvo.id, nome, sigla }),
                      })
                    }
                  />
                  {c.subs.length > 0 && (
                    <ul className="ml-3 border-l pl-3 sm:ml-5">
                      {c.subs.map((s) => (
                        <li key={s.alvo.id}>
                          <LinhaItem linha={s} {...acoesLinha} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["fase", "tipo"] as const).map((categoria) => {
          const lista = categoria === "fase" ? catalogo.fases : catalogo.tipos;
          return (
            <Card key={categoria}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">{categoria === "fase" ? "Fases" : "Tipos de documento"}</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    setDialogo({
                      tipo: "adicionar",
                      titulo: `Nov${categoria === "fase" ? "a fase" : "o tipo"} na v${v}`,
                      siglaObrigatoria: true,
                      montar: (nome, sigla) => ({ tipo: "item-novo", categoria, nome, sigla: sigla ?? "" }),
                    })
                  }
                >
                  <Plus className="size-4" /> Adicionar
                </Button>
              </CardHeader>
              <CardContent>
                {lista.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item nesta versão.</p>
                ) : (
                  <ul className="divide-y">
                    {lista.map((l) => (
                      <li key={l.alvo.id}>
                        <LinhaItem linha={l} {...acoesLinha} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {catalogo.saem.length > 0 && (
        <CollapsibleSection
          titulo={`Saem na v${v}`}
          descricao={`Existiam na v${v - 1} e não existem nesta. Continuam valendo nas versões anteriores.`}
          resumo={<Badge variant="outline">{catalogo.saem.length}</Badge>}
          defaultOpen
        >
          <ul className="divide-y">
            {catalogo.saem.map((l) => (
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
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDialogo({ tipo: "voltar", nome: l.nome, alvo: l.alvo })}>
                  <Undo2 className="size-3.5" /> Voltar para a v{v}
                </Button>
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
          onSalvar={(op, transferir) => executar([op], transferir, `Adicionado à v${v}.`)}
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
          onSalvar={(ops, transferir) => executar(ops, transferir, `Siglas de “${dialogo.rotulo}” na v${v} salvas.`)}
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
          onSalvar={(op, transferir) => executar([op], transferir, `“${dialogo.nome}” voltou para a v${v}.`)}
        />
      )}
      <ImportarCatalogoDialog aberto={importando} versao={v} onFechar={() => setImportando(false)} />
    </div>
  );
}

function SituacaoBadge({ linha, versao }: { linha: LinhaCatalogo; versao: number }) {
  if (linha.situacao === "entra") return <Badge variant="secondary" className="text-[10px]">novo na v{versao}</Badge>;
  if (linha.situacao === "sigla-nova") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        sigla nova{linha.siglaAnterior ? ` (era ${linha.siglaAnterior})` : ""}
      </Badge>
    );
  }
  return null;
}

function LinhaItem({
  linha,
  versao,
  pending,
  onSiglas,
  onTirar,
  onAdicionarSub,
}: {
  linha: LinhaCatalogo;
  versao: number;
  pending: boolean;
  onSiglas: (l: LinhaCatalogo) => void;
  onTirar: (l: LinhaCatalogo) => void;
  onAdicionarSub?: () => void;
}) {
  const estrutura = ESTRUTURA[linha.alvo.tipo];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm", linha.alvo.tipo === "disciplina" && "font-medium")}>
      <span className="min-w-0 flex-1 break-words">{linha.nome}</span>
      {estrutura && <span className="w-9 text-[10px] font-semibold tracking-wide text-muted-foreground">{estrutura}</span>}
      <span className="flex flex-wrap items-center gap-1.5">
        {linha.sigla ? <SiglaOficial sigla={linha.sigla} /> : <span className="text-xs font-normal text-muted-foreground">sem sigla</span>}
        {linha.sinonimos.map((s) => (
          <SiglaSinonimo key={s} sigla={s} />
        ))}
      </span>
      <SituacaoBadge linha={linha} versao={versao} />
      <span className="flex items-center">
        {onAdicionarSub && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`Adicionar sub-disciplina em ${linha.nome}`}
            title="Adicionar sub-disciplina"
            disabled={pending}
            onClick={onAdicionarSub}
          >
            <Plus className="size-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={`Siglas de ${linha.nome} na v${versao}`}
          title="Siglas nesta versão"
          disabled={pending}
          onClick={() => onSiglas(linha)}
        >
          <Tags className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={`Tirar ${linha.nome} da v${versao}`}
          title={`Tirar da v${versao}`}
          disabled={pending}
          onClick={() => onTirar(linha)}
        >
          <CircleMinus className="size-4" />
        </Button>
      </span>
    </div>
  );
}
