"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Upload,
  Shapes,
  Search,
  TriangleAlert,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  criarDisciplinaCatalogo,
  editarDisciplinaCatalogo,
  arquivarDisciplinaCatalogo,
  excluirDisciplinaCatalogo,
  moverDisciplinaCatalogo,
  renomearCategoriaDisciplinas,
} from "@/modules/projetos/actions";
import type { DisciplinaCatalogoAdmin } from "@/modules/projetos/queries";
import { normalizar } from "@/lib/disciplinas-core";
import { iconeDisciplina } from "@/lib/disciplinas";
import { GALERIA_ICONES, CHAVES_GALERIA } from "@/lib/disciplinas-galeria";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { BotaoSelecionados } from "@/components/ui/botao-selecionados";
import { Checkbox } from "@/components/ui/checkbox";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useLote } from "@/components/ui/use-lote";
import { useSelecao } from "@/components/ui/use-selecao";
import {
  ACAO_ARQUIVAR,
  ACAO_DESARQUIVAR,
  ACAO_DESCER,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_LOTE_ARQUIVAR,
  ACAO_LOTE_DESARQUIVAR,
  ACAO_LOTE_EXCLUIR,
  ACAO_SUBIR,
  excluiveis,
  itensDeDisciplinaCatalogo,
  itensDeLoteDisciplinas,
} from "@/modules/projetos/acoes-catalogo-disciplina";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SEM_CATEGORIA = "Outras";
const TODAS = "__todas__";
const SVG_MAX = 20 * 1024;

type FormState = {
  id?: string;
  nome: string;
  codigo: string;
  numeracao: string;
  numeracaoFim: string;
  categoria: string;
  icone: string | null;
  iconeSvg: string | null;
  /** Sinônimos p/ o motor de nomenclatura (uma sigla por linha ou separados por vírgula). */
  sinonimos: string;
};

const VAZIO: FormState = { nome: "", codigo: "", numeracao: "", numeracaoFim: "", categoria: "", icone: null, iconeSvg: null, sinonimos: "" };

/** "hdr, esg" ou "hdr\nesg" → ["HDR", "ESG"]. A action normaliza de novo (dedupe, própria sigla). */
function sinonimosDoTexto(texto: string): string[] {
  return texto
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Ícone de um item do catálogo, resolvido pelos próprios campos (svg → galeria → derivado). */
function IconeDisc({
  icone,
  iconeSvg,
  nome,
  className = "size-4",
}: {
  icone: string | null;
  iconeSvg: string | null;
  nome: string;
  className?: string;
}) {
  if (iconeSvg) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`data:image/svg+xml;utf8,${encodeURIComponent(iconeSvg)}`} alt="" aria-hidden className={className} />;
  }
  const Icone = (icone ? GALERIA_ICONES[icone] : undefined) ?? iconeDisciplina(nome);
  return <Icone className={className} aria-hidden />;
}

export function DisciplinasCatalogoView({ itens }: { itens: DisciplinaCatalogoAdmin[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [dialogo, setDialogo] = useState<FormState | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [filtroCat, setFiltroCat] = useState<string>(TODAS);
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  // Seleção compartilhada (ADR-0002, regra 3): o menu de contexto age sobre ela. Atravessa busca e
  // filtros; "Selecionados (N)" mostra só os marcados, de qualquer filtro.
  const selecao = useSelecao();
  const lote = useLote();

  const categorias = useMemo(
    () => [...new Set(itens.map((i) => i.categoria).filter((c): c is string => !!c))].sort(),
    [itens],
  );

  // Filtro: arquivadas (toggle) → busca (nome/sigla/categoria) → categoria.
  const filtradas = useMemo(() => {
    const q = normalizar(busca);
    return itens.filter((i) => {
      if (selecao.soSelecionados) return selecao.ids.has(i.id);
      if (!mostrarArquivadas && !i.ativo) return false;
      if (filtroCat !== TODAS && (i.categoria || SEM_CATEGORIA) !== filtroCat) return false;
      if (!q) return true;
      return (
        normalizar(i.nome).includes(q) ||
        normalizar(i.codigo ?? "").includes(q) ||
        normalizar(i.categoria ?? "").includes(q)
      );
    });
  }, [itens, busca, filtroCat, mostrarArquivadas, selecao.soSelecionados, selecao.ids]);

  // Agrupa por categoria; "Outras" por último.
  const grupos = useMemo(() => {
    const mapa = new Map<string, DisciplinaCatalogoAdmin[]>();
    for (const i of filtradas) {
      const k = i.categoria || SEM_CATEGORIA;
      (mapa.get(k) ?? mapa.set(k, []).get(k)!).push(i);
    }
    return [...mapa.entries()].sort(([a], [b]) =>
      a === SEM_CATEGORIA ? 1 : b === SEM_CATEGORIA ? -1 : a.localeCompare(b),
    );
  }, [filtradas]);

  const totalAtivas = itens.filter((i) => i.ativo).length;
  const totalArquivadas = itens.length - totalAtivas;

  function salvar(form: FormState) {
    if (!form.nome.trim()) return;
    start(async () => {
      const payload = {
        nome: form.nome.trim(),
        codigo: form.codigo.trim() || undefined,
        numeracao: form.numeracao.trim() === "" ? null : Number(form.numeracao),
        numeracaoFim: form.numeracaoFim.trim() === "" ? null : Number(form.numeracaoFim),
        categoria: form.categoria.trim() || undefined,
        icone: form.icone || undefined,
        iconeSvg: form.iconeSvg || undefined,
        sinonimos: sinonimosDoTexto(form.sinonimos),
      };
      const r = form.id
        ? await editarDisciplinaCatalogo({ id: form.id, ...payload })
        : await criarDisciplinaCatalogo(payload);
      if (r.ok) {
        toast.success(form.id ? "Disciplina atualizada." : "Disciplina criada.");
        setDialogo(null);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  /** Renomeia a categoria em todas as disciplinas dela de uma vez (nome vazio = tirar categoria). */
  function renomearCategoria(de: string, para: string) {
    start(async () => {
      const r = await renomearCategoriaDisciplinas({ de, para: para.trim() });
      if (r.ok) {
        toast.success(para.trim() ? "Categoria renomeada." : "Categoria removida — as disciplinas foram para “Outras”.");
        setRenomeando(null);
        if (filtroCat === de) setFiltroCat(TODAS); // o filtro apontava pra um grupo que não existe mais
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function arquivar(item: DisciplinaCatalogoAdmin) {
    start(async () => {
      const r = await arquivarDisciplinaCatalogo({ id: item.id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function mover(item: DisciplinaCatalogoAdmin, vizinhoId: string) {
    start(async () => {
      const r = await moverDisciplinaCatalogo({ id: item.id, vizinhoId });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  async function excluir(item: DisciplinaCatalogoAdmin) {
    // Em uso → exclusão bloqueada; comunica no confirm e oferece arquivar (se ainda ativa).
    if (item.uso > 0) {
      const ok = await confirm({
        title: "Não é possível excluir",
        description: `“${item.nome}” está em uso em ${item.uso} projeto(s). Arquive em vez de excluir — some dos seletores sem apagar os projetos.`,
        confirmLabel: item.ativo ? "Arquivar" : "Entendi",
        cancelLabel: "Fechar",
      });
      if (ok && item.ativo) arquivar(item);
      return;
    }
    const ok = await confirm({
      title: `Excluir “${item.nome}”?`,
      description: "A disciplina será removida em definitivo do catálogo. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirDisciplinaCatalogo({ id: item.id });
      if (r.ok) {
        toast.success("Disciplina excluída.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  /** Marcadas que ainda existem (a lista muda quando alguém exclui). */
  const alvosSelecao = itens.filter((i) => selecao.marcado(i.id));
  const itensDoLote = itensDeLoteDisciplinas(alvosSelecao);

  async function executarLote(item: AcaoItemAcao) {
    const nomes = new Map(alvosSelecao.map((d) => [d.id, d.nome]));
    const rotulo = (id: string) => nomes.get(id) ?? id;
    if (item.id === ACAO_LOTE_ARQUIVAR || item.id === ACAO_LOTE_DESARQUIVAR) {
      const arquivando = item.id === ACAO_LOTE_ARQUIVAR;
      // A action alterna o estado; por isso só entram as que estão no estado de partida certo.
      await lote.executar({
        ids: alvosSelecao.filter((d) => d.ativo === arquivando).map((d) => d.id),
        acao: (id) => arquivarDisciplinaCatalogo({ id }),
        substantivo: ["disciplina", "disciplinas"],
        verbo: arquivando ? ["arquivada", "arquivadas"] : ["desarquivada", "desarquivadas"],
        rotulo,
        aoConcluir: selecao.limpar,
      });
    } else if (item.id === ACAO_LOTE_EXCLUIR) {
      const livres = excluiveis(alvosSelecao);
      const emUso = alvosSelecao.length - livres.length;
      await lote.executar({
        ids: livres.map((d) => d.id),
        acao: (id) => excluirDisciplinaCatalogo({ id }),
        substantivo: ["disciplina", "disciplinas"],
        verbo: ["excluída", "excluídas"],
        rotulo,
        confirmar: {
          titulo: (n) => `Excluir ${n} ${n === 1 ? "disciplina" : "disciplinas"}?`,
          descricao:
            emUso > 0
              ? `${item.confirmar?.descricao ?? ""} ${emUso} ${emUso === 1 ? "está" : "estão"} em uso em projetos e ficam de fora — arquive-${emUso === 1 ? "a" : "as"}.`.trim()
              : item.confirmar?.descricao,
          rotuloConfirmar: item.confirmar?.rotuloConfirmar,
          destrutivo: true,
        },
        aoConcluir: selecao.limpar,
      });
    }
  }

  /** Ação de UMA disciplina (ou do lote, quando o item vem do menu de uma seleção de várias). */
  function aoSelecionarNaLinha(item: DisciplinaCatalogoAdmin, cimaId: string | null, baixoId: string | null, acao: AcaoItemAcao) {
    if (acao.id.startsWith("lote-")) {
      void executarLote(acao);
      return;
    }
    if (acao.id === ACAO_EDITAR) setDialogo(paraForm(item));
    else if (acao.id === ACAO_SUBIR && cimaId) mover(item, cimaId);
    else if (acao.id === ACAO_DESCER && baixoId) mover(item, baixoId);
    else if (acao.id === ACAO_ARQUIVAR || acao.id === ACAO_DESARQUIVAR) arquivar(item);
    else if (acao.id === ACAO_EXCLUIR) void excluir(item);
  }

  return (
    <div className="space-y-5">
      <DicaMenuContexto />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/configuracoes"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Configurações
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">Catálogo de Disciplinas</h2>
          <p className="text-sm text-muted-foreground">
            Nomes canônicos usados em projetos e propostas. O código é usado na nomenclatura de arquivos.
          </p>
        </div>
        <Button onClick={() => setDialogo(VAZIO)} disabled={pending}>
          <Plus className="size-4" /> Adicionar nova disciplina
        </Button>
      </div>

      {/* Barra de ferramentas: busca · categoria · arquivadas */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-2.5 size-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, sigla ou categoria…"
            className="pl-8"
          />
        </div>
        <Select value={filtroCat} onValueChange={(v) => setFiltroCat(v ?? TODAS)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
            {itens.some((i) => !i.categoria) && <SelectItem value={SEM_CATEGORIA}>{SEM_CATEGORIA}</SelectItem>}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={mostrarArquivadas} onCheckedChange={setMostrarArquivadas} />
          Arquivadas ({totalArquivadas})
        </label>
        <BotaoSelecionados
          total={selecao.total}
          ativo={selecao.soSelecionados}
          onChange={selecao.verSelecionados}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {filtradas.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Shapes}
                title={busca || filtroCat !== TODAS ? "Nada encontrado" : "Nenhuma disciplina"}
                description={
                  busca || filtroCat !== TODAS
                    ? "Ajuste a busca ou o filtro de categoria."
                    : "Adicione a primeira disciplina do catálogo."
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 pr-0">
                    <Checkbox
                      checked={selecao.estadoDaPagina(filtradas.map((d) => d.id)) === "todos"}
                      onCheckedChange={() => selecao.alternarPagina(filtradas.map((d) => d.id))}
                      aria-label="Marcar todas as disciplinas da lista"
                    />
                  </TableHead>
                  <TableHead className="w-9" />
                  <TableHead>Disciplina</TableHead>
                  <TableHead className="w-16 text-center">Nº</TableHead>
                  <TableHead className="w-24">Código</TableHead>
                  <TableHead className="w-24">Uso</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map(([categoria, lista]) => (
                  <GrupoCategoria
                    key={categoria}
                    categoria={categoria}
                    lista={lista}
                    onRenomear={categoria === SEM_CATEGORIA ? undefined : () => setRenomeando(categoria)}
                  >
                    {lista.map((item, idx) => {
                      const cimaId = idx > 0 ? lista[idx - 1].id : null;
                      const baixoId = idx < lista.length - 1 ? lista[idx + 1].id : null;
                      const menuItens: AcaoItem[] =
                        alvosSelecao.length > 1 && selecao.marcado(item.id)
                          ? itensDoLote
                          : itensDeDisciplinaCatalogo(item, {
                              podeReordenar: !busca && !selecao.soSelecionados,
                              temCima: !!cimaId,
                              temBaixo: !!baixoId,
                            });
                      return (
                        <ItemLinha
                          key={item.id}
                          item={item}
                          pending={pending}
                          podeReordenar={!busca && !selecao.soSelecionados}
                          vizinhoCimaId={cimaId}
                          vizinhoBaixoId={baixoId}
                          marcado={selecao.marcado(item.id)}
                          onAlternar={() => selecao.alternar(item.id)}
                          aoAbrirMenu={(aberto) => {
                            if (aberto) selecao.aoAbrirMenu(item.id);
                          }}
                          menuItens={menuItens}
                          onSelect={(acao) => aoSelecionarNaLinha(item, cimaId, baixoId, acao)}
                          onMover={(vizinhoId) => mover(item, vizinhoId)}
                          onEditar={() => setDialogo(paraForm(item))}
                        />
                      );
                    })}
                  </GrupoCategoria>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {totalAtivas} ativa(s){totalArquivadas > 0 && ` · ${totalArquivadas} arquivada(s)`}.
      </p>

      <BarraSelecao
        total={alvosSelecao.length}
        itens={itensDoLote}
        onSelect={(item) => void executarLote(item)}
        onLimpar={selecao.limpar}
        substantivo={["disciplina", "disciplinas"]}
        genero="f"
        progresso={lote.progresso}
      />
      {lote.portal}

      {renomeando && (
        <RenomearCategoriaDialog
          categoria={renomeando}
          quantas={itens.filter((i) => i.categoria === renomeando).length}
          pending={pending}
          onSalvar={(novo) => renomearCategoria(renomeando, novo)}
          onFechar={() => setRenomeando(null)}
        />
      )}

      {dialogo && (
        <DisciplinaDialog
          inicial={dialogo}
          categorias={categorias}
          pending={pending}
          onSalvar={salvar}
          onFechar={() => setDialogo(null)}
        />
      )}
    </div>
  );
}

function paraForm(item: DisciplinaCatalogoAdmin): FormState {
  return {
    id: item.id,
    nome: item.nome,
    codigo: item.codigo ?? "",
    numeracao: item.numeracao != null ? String(item.numeracao) : "",
    numeracaoFim: item.numeracaoFim != null ? String(item.numeracaoFim) : "",
    categoria: item.categoria ?? "",
    icone: item.icone,
    iconeSvg: item.iconeSvg,
    sinonimos: item.sinonimos.join(", "),
  };
}

/** Linha-cabeçalho da categoria + suas linhas. */
function GrupoCategoria({
  categoria,
  lista,
  onRenomear,
  children,
}: {
  categoria: string;
  lista: DisciplinaCatalogoAdmin[];
  /** Ausente em "Outras": ali não existe categoria pra renomear, é o grupo de quem não tem. */
  onRenomear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={7} className="py-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{categoria}</span>
              {onRenomear && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title={`Renomear a categoria ${categoria}`}
                  aria-label={`Renomear a categoria ${categoria}`}
                  onClick={onRenomear}
                >
                  <Pencil className="size-3" />
                </Button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{lista.length}</span>
          </div>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}

function ItemLinha({
  item,
  pending,
  podeReordenar,
  vizinhoCimaId,
  vizinhoBaixoId,
  marcado,
  onAlternar,
  aoAbrirMenu,
  menuItens,
  onSelect,
  onMover,
  onEditar,
}: {
  item: DisciplinaCatalogoAdmin;
  pending: boolean;
  podeReordenar: boolean;
  vizinhoCimaId: string | null;
  vizinhoBaixoId: string | null;
  marcado: boolean;
  onAlternar: () => void;
  aoAbrirMenu: (aberto: boolean) => void;
  menuItens: AcaoItem[];
  onSelect: (acao: AcaoItemAcao) => void;
  onMover: (vizinhoId: string) => void;
  onEditar: () => void;
}) {
  return (
    <LinhaComMenu
      itens={menuItens}
      onSelect={onSelect}
      aoAbrir={aoAbrirMenu}
      render={
        <TableRow
          data-marcada={marcado}
          className={cn("data-[marcada=true]:bg-accent/40 data-[popup-open]:bg-muted/50", !item.ativo && "opacity-60")}
        />
      }
    >
      <TableCell className="pr-0">
        <Checkbox checked={marcado} onCheckedChange={onAlternar} aria-label={`Selecionar ${item.nome}`} />
      </TableCell>
      <TableCell>
        <IconeDisc icone={item.icone} iconeSvg={item.iconeSvg} nome={item.nome} className="size-5 text-muted-foreground" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className={cn("font-medium", !item.ativo && "line-through")}>{item.nome}</span>
          {!item.ativo && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              arquivada
            </Badge>
          )}
          {!item.codigo && (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
              title="Sem sigla — a nomenclatura de arquivos usará o nome inteiro."
            >
              <TriangleAlert className="size-3" /> sem sigla
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-center">
        {item.numeracao != null ? (
          <span className="font-mono text-xs tabular-nums" title={item.numeracaoFim != null ? "Faixa reconhecida no envio" : "Sem fim de faixa — envio não reconhece disciplina por número"}>
            {item.numeracao}{item.numeracaoFim != null ? `–${item.numeracaoFim}` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {item.codigo ? (
          <div className="flex flex-col gap-0.5">
            <Badge variant="outline" className="w-fit font-mono text-[10px] uppercase">
              {item.codigo}
            </Badge>
            {item.sinonimos.length > 0 && (
              <span
                className="text-[10px] text-muted-foreground"
                title={`O motor de nomenclatura também reconhece: ${item.sinonimos.join(", ")}`}
              >
                = {item.sinonimos.join(", ")}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {item.uso > 0 ? (
          <Link
            href={`/projetos?disciplina=${encodeURIComponent(item.nome)}`}
            className="text-xs text-primary hover:underline"
            title={`Ver ${item.uso} projeto(s) que usam esta disciplina`}
          >
            {item.uso} proj.
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end">
          {podeReordenar && (
            <div className="mr-0.5 flex flex-col">
              <button
                type="button"
                aria-label="Mover para cima"
                disabled={pending || !vizinhoCimaId}
                onClick={() => vizinhoCimaId && onMover(vizinhoCimaId)}
                className="text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Mover para baixo"
                disabled={pending || !vizinhoBaixoId}
                onClick={() => vizinhoBaixoId && onMover(vizinhoBaixoId)}
                className="text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </div>
          )}
          <Button size="icon" variant="ghost" className="size-8" aria-label="Editar" onClick={onEditar} disabled={pending}>
            <Pencil className="size-4" />
          </Button>
          <BotaoAcoes itens={menuItens} onSelect={onSelect} rotulo={`Mais ações para ${item.nome}`} className="size-8" />
        </div>
      </TableCell>
    </LinhaComMenu>
  );
}

/**
 * Renomeia uma categoria inteira. Categoria não é cadastro próprio — é um texto repetido em cada
 * disciplina —, então sem isto trocar o nome de um grupo era abrir disciplina por disciplina.
 */
function RenomearCategoriaDialog({
  categoria,
  quantas,
  pending,
  onSalvar,
  onFechar,
}: {
  categoria: string;
  quantas: number;
  pending: boolean;
  onSalvar: (novo: string) => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(categoria);
  const limpo = nome.trim();

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renomear categoria</DialogTitle>
          <DialogDescription>
            Vale para as {quantas} disciplina(s) de &ldquo;{categoria}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Nome da categoria</Label>
          <Input
            value={nome}
            maxLength={60}
            autoFocus
            placeholder="CIVIL"
            onChange={(e) => setNome(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            {limpo === ""
              ? "Em branco, a categoria deixa de existir e as disciplinas vão para “Outras”."
              : "Usar o nome de outra categoria existente junta os dois grupos em um só."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => onSalvar(nome)} disabled={pending || limpo === categoria}>
            {pending ? "Salvando…" : limpo === "" ? "Remover categoria" : "Renomear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisciplinaDialog({
  inicial,
  categorias,
  pending,
  onSalvar,
  onFechar,
}: {
  inicial: FormState;
  categorias: string[];
  pending: boolean;
  onSalvar: (f: FormState) => void;
  onFechar: () => void;
}) {
  const [form, setForm] = useState<FormState>(inicial);

  async function onArquivoSvg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo
    if (!file) return;
    if (file.size > SVG_MAX) {
      toast.error("SVG acima de 20 KB.");
      return;
    }
    const txt = await file.text();
    if (!txt.includes("<svg")) {
      toast.error("Arquivo não parece um SVG.");
      return;
    }
    setForm((f) => ({ ...f, iconeSvg: txt, icone: null }));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar disciplina" : "Nova disciplina"}</DialogTitle>
          <DialogDescription>Nome, sigla, categoria e ícone.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label>Código</Label>
            <Input
              value={form.codigo}
              maxLength={6}
              placeholder="ELE"
              className="font-mono uppercase"
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Numeração — início</Label>
              <Input
                type="number"
                min={0}
                value={form.numeracao}
                placeholder="4000"
                className="font-mono tabular-nums"
                onChange={(e) => setForm((f) => ({ ...f, numeracao: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Numeração — fim</Label>
              <Input
                type="number"
                min={0}
                value={form.numeracaoFim}
                placeholder="4999"
                className="font-mono tabular-nums"
                onChange={(e) => setForm((f) => ({ ...f, numeracaoFim: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Bloco na nomenclatura (ex.: 4000–4999 → folhas 4001, 4002…). Sem o fim da faixa, o
            envio não reconhece a disciplina só pelo número do arquivo. Faixa abaixo de 1000
            (ex.: Topografia) também não é reconhecida por número sozinha — só a sigla no nome.
          </p>

          <div className="space-y-1.5">
            <Label>Sinônimos</Label>
            <Input
              value={form.sinonimos}
              placeholder="HDR, ESG"
              disabled={!form.codigo.trim()}
              onChange={(e) => setForm((f) => ({ ...f, sinonimos: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              {form.codigo.trim()
                ? "Siglas alternativas que o motor de nomenclatura reconhece como esta disciplina, separadas por vírgula."
                : "Defina um código antes de cadastrar sinônimos — sem código não há o que reconhecer."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Input
              list="cats-disc"
              value={form.categoria}
              placeholder="CIVIL, ELÉTRICA…"
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
            />
            <datalist id="cats-disc">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="text-[11px] text-muted-foreground">
              Digite um nome novo para criar uma categoria; deixe em branco para a disciplina
              ficar em &ldquo;Outras&rdquo;. Para renomear uma categoria inteira, use o lápis no
              cabeçalho dela na lista.
            </p>
            {categorias.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {categorias.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="xs"
                    variant={form.categoria.trim() === c ? "secondary" : "outline"}
                    className="h-6 text-[11px]"
                    onClick={() => setForm((f) => ({ ...f, categoria: f.categoria.trim() === c ? "" : c }))}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Ícone</Label>
            <Tabs defaultValue="galeria">
              <TabsList>
                <TabsTrigger value="galeria">Galeria</TabsTrigger>
                <TabsTrigger value="svg">Enviar SVG</TabsTrigger>
              </TabsList>

              <TabsContent value="galeria" className="pt-2">
                <div className="grid max-h-52 grid-cols-8 gap-1 overflow-y-auto rounded-md border p-2">
                  {CHAVES_GALERIA.map((chave) => {
                    const Icone = GALERIA_ICONES[chave];
                    const sel = form.icone === chave && !form.iconeSvg;
                    return (
                      <button
                        key={chave}
                        type="button"
                        title={chave}
                        onClick={() => setForm((f) => ({ ...f, icone: chave, iconeSvg: null }))}
                        className={cn(
                          "grid aspect-square place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-muted",
                          sel ? "border-primary bg-primary/10 text-primary" : "border-transparent",
                        )}
                      >
                        <Icone className="size-5" />
                      </button>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="svg" className="pt-2">
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-md border bg-muted/40">
                    <IconeDisc icone={form.icone} iconeSvg={form.iconeSvg} nome={form.nome} className="size-7 text-foreground" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-sm hover:bg-muted">
                      <Upload className="size-4" /> Escolher .svg
                      <input type="file" accept=".svg,image/svg+xml" className="hidden" onChange={onArquivoSvg} />
                    </label>
                    <p className="text-xs text-muted-foreground">SVG até 20 KB. Sanitizado no envio.</p>
                    {form.iconeSvg && (
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline"
                        onClick={() => setForm((f) => ({ ...f, iconeSvg: null }))}
                      >
                        Remover SVG
                      </button>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            {!form.icone && !form.iconeSvg && (
              <p className="text-xs text-muted-foreground">
                Sem ícone escolhido → o sistema deriva um ícone pelo nome.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => onSalvar(form)} disabled={pending || !form.nome.trim()}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
