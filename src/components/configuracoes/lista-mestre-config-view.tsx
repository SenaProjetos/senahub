"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, EyeOff, Tags } from "lucide-react";
import { SiglasVersaoDialog, type VersaoOpcao } from "@/components/configuracoes/siglas-versao-dialog";
import { rotuloFaixa, valeNaVersao, versaoMaisNova } from "@/modules/uploads/nomenclatura/siglas-versao";
import {
  ValidadeVersaoCampos,
  faixaDoForm,
  faixaParaForm,
  mostrarValidade,
  rotuloVersaoOpcao,
  type FaixaForm,
} from "@/components/configuracoes/validade-versao-campos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  criarCatalogoPrancha,
  editarCatalogoPrancha,
  excluirCatalogoPrancha,
} from "@/modules/projetos/pranchas/catalogo-actions";
import type { PranchaCatalogoRow } from "@/modules/projetos/pranchas/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** "hdr, esg" ou "hdr\nesg" → ["hdr", "esg"]. A action normaliza de novo (uppercase, dedupe). */
function sinonimosDoTexto(texto: string): string[] {
  return texto
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Categoria = "folha" | "tipo" | "fase";
const SECOES: {
  categoria: Categoria;
  titulo: string;
  descricao: string;
  /** Exemplo de CADA categoria — sem isso as três colunas mostravam o mesmo exemplo genérico
   *  (sigla/nome de Fase sob "Tipos de documento"), o que parecia dado real duplicado. */
  exemplo: { sigla: string; nome: string; sinonimos: string };
}[] = [
  {
    categoria: "fase",
    titulo: "Fases",
    descricao: "Etapa do projeto (ex.: EX — Projeto Executivo).",
    exemplo: { sigla: "EX", nome: "Projeto Executivo", sinonimos: "EXE, PE" },
  },
  {
    categoria: "tipo",
    titulo: "Tipos de documento",
    // "PL — Planta" saiu: no catálogo do escritório PL é a fase Estudo Preliminar.
    descricao: "Natureza da folha (ex.: DET — Desenho Técnico).",
    exemplo: { sigla: "DET", nome: "Desenho Técnico", sinonimos: "DE, DTC" },
  },
  {
    categoria: "folha",
    titulo: "Folhas (formato)",
    descricao: "Formato do papel (ex.: A1).",
    exemplo: { sigla: "A1", nome: "A1 (594×841)", sinonimos: "" },
  },
];

const TODAS = "__todas__";

export function ListaMestreConfigView({
  catalogos,
  projetoId,
  versoes = [],
  categorias = ["fase", "tipo", "folha"],
}: {
  catalogos: PranchaCatalogoRow[];
  /** Quais seções mostrar (a aba "Formatos de folha" mostra só a folha). Padrão: as três. */
  categorias?: Categoria[];
  /** Quando informado, as siglas criadas ficam restritas a este projeto. */
  projetoId?: string;
  /** Ausente/vazio (tela por projeto) = sem filtro de versão nem "Siglas por versão". */
  versoes?: VersaoOpcao[];
}) {
  const [filtroVersao, setFiltroVersao] = useState<string>(TODAS);
  const versaoVigente = versoes.filter((v) => v.publicadaEm).at(-1)?.numero ?? null;

  return (
    <div className="space-y-3">
      {versoes.length > 0 && (
        <div className="flex justify-end">
          <Select value={filtroVersao} onValueChange={(v) => setFiltroVersao(v ?? TODAS)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as versões</SelectItem>
              {versoes.map((v) => (
                <SelectItem key={v.id} value={String(v.numero)}>
                  Válido na v{v.numero}{v.numero === versaoVigente ? " (vigente)" : v.publicadaEm ? "" : " (rascunho)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className={categorias.length === 1 ? "max-w-xl" : "grid gap-4 lg:grid-cols-3"}>
        {SECOES.filter((s) => categorias.includes(s.categoria)).map((s) => (
          <SecaoCatalogo
            key={s.categoria}
            categoria={s.categoria}
            titulo={s.titulo}
            descricao={s.descricao}
            exemplo={s.exemplo}
            projetoId={projetoId}
            versoes={versoes}
            rows={catalogos.filter(
              (c) => c.categoria === s.categoria && (filtroVersao === TODAS || valeNaVersao(c, Number(filtroVersao))),
            )}
          />
        ))}
      </div>
    </div>
  );
}

function SecaoCatalogo({
  categoria,
  titulo,
  descricao,
  exemplo,
  rows,
  projetoId,
  versoes,
}: {
  categoria: Categoria;
  titulo: string;
  descricao: string;
  exemplo: { sigla: string; nome: string; sinonimos: string };
  rows: PranchaCatalogoRow[];
  projetoId?: string;
  versoes: VersaoOpcao[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sigla, setSigla] = useState("");
  const [nome, setNome] = useState("");
  const [sinonimos, setSinonimos] = useState("");
  // "A partir da" do item novo: abre na versão mais nova, como as siglas. Só na tela global — a
  // sigla própria de um projeto não tem validade por versão.
  const [desde, setDesde] = useState(() => String(versaoMaisNova(versoes) ?? 1));
  const ordenadas = [...versoes].sort((a, b) => a.numero - b.numero);
  const [editar, setEditar] = useState<PranchaCatalogoRow | null>(null);
  const [siglasDe, setSiglasDe] = useState<PranchaCatalogoRow | null>(null);

  function adicionar() {
    if (!sigla.trim() || !nome.trim()) {
      toast.error("Informe sigla e nome.");
      return;
    }
    start(async () => {
      const r = await criarCatalogoPrancha({
        categoria,
        sigla,
        nome,
        projetoId,
        sinonimos: sinonimosDoTexto(sinonimos),
        ...(projetoId ? {} : { versaoDesde: Number(desde) || 1 }),
      });
      if (r.ok) {
        toast.success("Sigla adicionada.");
        setSigla("");
        setNome("");
        setSinonimos("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function alternarAtivo(row: PranchaCatalogoRow) {
    start(async () => {
      // `sinonimos` do próprio row: sem isso, a action recebe lista vazia e APAGA os sinônimos
      // cadastrados só porque esta ação não tocou neles.
      const r = await editarCatalogoPrancha({
        id: row.id,
        sigla: row.sigla,
        nome: row.nome,
        ativo: !row.ativo,
        sinonimos: row.sinonimos,
      });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirCatalogoPrancha({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <EmptyState icon={Tags} title="Nenhuma sigla" />
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 py-1.5 text-sm">
                <Badge variant="outline" className="shrink-0 font-mono">{row.sigla}</Badge>
                <span className={`min-w-0 flex-1 truncate ${row.ativo ? "" : "text-muted-foreground line-through"}`}>
                  {row.nome}
                  {rotuloFaixa(row) && <span className="ml-1.5 text-xs text-muted-foreground">· {rotuloFaixa(row)}</span>}
                  {row.siglasPorVersao && (
                    <span
                      className="ml-1.5 text-xs text-muted-foreground"
                      title="Este item tem siglas diferentes por versão — veja em “Siglas por versão”."
                    >
                      · siglas por versão
                    </span>
                  )}
                  {row.sinonimos.length > 0 && !row.siglasPorVersao && (
                    <span
                      className="ml-1.5 text-xs text-muted-foreground"
                      title={`O motor de nomenclatura também reconhece: ${row.sinonimos.join(", ")}`}
                    >
                      (= {row.sinonimos.join(", ")})
                    </span>
                  )}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={row.ativo ? "Desativar" : "Ativar"}
                  title={row.ativo ? "Desativar" : "Ativar"}
                  disabled={pending}
                  onClick={() => alternarAtivo(row)}
                >
                  {row.ativo ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 text-muted-foreground" />}
                </Button>
                {versoes.length > 0 && (
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Siglas de ${row.nome} por versão`} title="Siglas por versão" onClick={() => setSiglasDe(row)}>
                    <Tags className="size-3.5" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="size-7" aria-label="Editar" onClick={() => setEditar(row)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label="Excluir" disabled={pending} onClick={() => excluir(row.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Formulário de UMA sigla nova — sinônimo aqui é só o dela, não um campo geral. Sigla
            já existente edita pelo lápis na lista acima (inclusive o sinônimo dela). */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Nova sigla</p>
          <div className="flex items-end gap-2">
            <div className="w-20 space-y-1">
              <Label className="text-xs">Sigla</Label>
              <Input value={sigla} onChange={(e) => setSigla(e.target.value.toUpperCase())} placeholder={exemplo.sigla} className="font-mono" />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={exemplo.nome} />
            </div>
            <Button size="icon" aria-label="Adicionar" disabled={pending} onClick={adicionar}>
              <Plus className="size-4" />
            </Button>
          </div>
          {!projetoId && ordenadas.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Vale a partir da</Label>
              <Select value={desde} onValueChange={(v) => setDesde(v ?? "1")}>
                <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ordenadas.map((v) => (
                    <SelectItem key={v.id} value={String(v.numero)}>{rotuloVersaoOpcao(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Sinônimos desta sigla (opcional)</Label>
            <Input value={sinonimos} onChange={(e) => setSinonimos(e.target.value)} placeholder={exemplo.sinonimos || undefined} />
          </div>
        </div>
      </CardContent>

      <EditarDialog row={editar} versoes={projetoId ? [] : versoes} onClose={() => setEditar(null)} />
      <SiglasVersaoDialog
        aberto={siglasDe !== null}
        onFechar={() => setSiglasDe(null)}
        alvo={siglasDe ? { tipo: "prancha", id: siglasDe.id } : null}
        rotuloAlvo={siglasDe?.nome ?? ""}
        versoes={versoes}
      />
    </Card>
  );
}

function EditarDialog({
  row,
  versoes,
  onClose,
}: {
  row: PranchaCatalogoRow | null;
  /** Vazio = sigla própria de projeto (sem validade por versão). */
  versoes: VersaoOpcao[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sigla, setSigla] = useState("");
  const [nome, setNome] = useState("");
  const [sinonimos, setSinonimos] = useState("");
  const [faixa, setFaixa] = useState<FaixaForm>({ desde: "1", ate: "" });
  const [lastId, setLastId] = useState<string | null>(null);

  // Sincroniza o form quando abre em outra linha (sem useEffect).
  if (row && row.id !== lastId) {
    setLastId(row.id);
    setSigla(row.sigla);
    setNome(row.nome);
    setSinonimos(row.sinonimos.join(", "));
    setFaixa(faixaParaForm(row));
  }
  const travado = row?.siglasPorVersao ?? false;

  function salvar() {
    if (!row) return;
    if (!sigla.trim() || !nome.trim()) {
      toast.error("Informe sigla e nome.");
      return;
    }
    start(async () => {
      const r = await editarCatalogoPrancha({
        id: row.id,
        sigla,
        nome,
        ativo: row.ativo,
        sinonimos: sinonimosDoTexto(sinonimos),
        ...(versoes.length > 0 ? faixaDoForm(faixa) : {}),
      });
      if (r.ok) {
        toast.success("Sigla atualizada.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar sigla</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="w-20 space-y-1.5">
              <Label>Sigla</Label>
              <Input value={sigla} disabled={travado} onChange={(e) => setSigla(e.target.value.toUpperCase())} className="font-mono" />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Sinônimos</Label>
            <Input value={sinonimos} disabled={travado} onChange={(e) => setSinonimos(e.target.value)} placeholder="PE, EXE" />
            <p className="text-[11px] text-muted-foreground">
              {travado
                ? "As siglas deste item já são definidas por versão. Para mudar sigla ou sinônimos, use “Siglas por versão” (ícone de etiqueta na linha) — aqui eles ficam como estão."
                : "Siglas alternativas que o motor de nomenclatura reconhece como esta, separadas por vírgula."}
            </p>
          </div>
          {versoes.length > 0 && mostrarValidade(versoes, faixa) && (
            <ValidadeVersaoCampos versoes={versoes} valor={faixa} onChange={setFaixa} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
