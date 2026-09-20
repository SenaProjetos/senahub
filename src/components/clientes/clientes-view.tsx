"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Search, UserPlus, Download } from "lucide-react";
import {
  desativarCliente,
  reativarCliente,
} from "@/modules/clientes/actions";
import type { ClienteListItem } from "@/modules/clientes/queries";
import type { CriarClienteInput } from "@/modules/clientes/schemas";
import { STATUS_COMERCIAL_LABEL, opcoesDe } from "@/modules/comercial/labels";
import { ClienteForm } from "@/components/clientes/cliente-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SortableHead } from "@/components/ui/sortable-head";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { Checkbox } from "@/components/ui/checkbox";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useLote } from "@/components/ui/use-lote";
import { useNomesVistos } from "@/components/ui/use-nomes-vistos";
import { useSelecao } from "@/components/ui/use-selecao";
import { copiarTexto } from "@/lib/clipboard";
import {
  ACAO_ALTERNAR_ATIVO,
  ACAO_COPIAR_DOCUMENTO,
  ACAO_COPIAR_EMAIL,
  ACAO_COPIAR_NOME,
  ACAO_EDITAR,
  ACAO_LOTE_DESATIVAR,
  ACAO_LOTE_REATIVAR,
  itensDeCliente,
  itensDeLoteClientes,
} from "@/modules/clientes/acoes";
import { Pagination } from "@/components/ui/pagination";
import { useSetParams } from "@/lib/use-set-param";

type FormCliente = CriarClienteInput & {
  id?: string;
  status?: keyof typeof STATUS_COMERCIAL_LABEL;
};

const TODOS = "todos";

export function ClientesView({
  clientes,
  podeGerir,
  busca,
  total,
  page,
  pageCount,
  pageSize,
  ufs,
  categorias,
  segmentos,
  tipo,
  situacao,
  uf,
  categoria,
  segmentoId,
  status,
  listaSN,
}: {
  clientes: ClienteListItem[];
  podeGerir: boolean;
  busca: string;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  ufs: string[];
  categorias: string[];
  segmentos: { id: string; nome: string }[];
  tipo: string;
  situacao: string;
  uf: string;
  categoria: string;
  segmentoId: string;
  status: string;
  /** F4.1 — "lista SN": candidatos curados do Sales Navigator. */
  listaSN: boolean;
}) {
  const setParams = useSetParams();
  // F4.6: export CSV com os MESMOS filtros/ordenação ativos na tela — parte da URL atual
  // (`sort`/`dir` incluso de graça, sem precisar virar prop nova), só tirando `page`/
  // `pageSize`: exportar é sempre "tudo que bate no filtro", nunca só a página aberta.
  const paramsExport = new URLSearchParams(useSearchParams().toString());
  paramsExport.delete("page");
  paramsExport.delete("pageSize");
  const [q, setQ] = useState(busca);
  // Seleção compartilhada: atravessa páginas e filtros (a tela continua montada ao paginar) e o
  // menu de contexto age sobre ela (ADR-0002, regra 3).
  const selecao = useSelecao();
  const lote = useLote();
  const nomeDe = useNomesVistos(clientes, (c) => c.id, (c) => c.nome);
  const [form, setForm] = useState<FormCliente | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [, startTransition] = useTransition();

  function buscar() {
    setParams({ q: q || null });
  }

  function novo() {
    setForm(null);
    setFormOpen(true);
  }

  function editar(c: ClienteListItem) {
    setForm({
      id: c.id,
      tipo: c.tipo,
      nome: c.nome,
      nomeFantasia: c.nomeFantasia ?? undefined,
      documento: c.documento ?? undefined,
      email: c.email ?? undefined,
      telefone: c.telefone ?? undefined,
      cep: c.cep ?? undefined,
      logradouro: c.logradouro ?? undefined,
      numero: c.numero ?? undefined,
      complemento: c.complemento ?? undefined,
      bairro: c.bairro ?? undefined,
      cidade: c.cidade ?? undefined,
      uf: c.uf ?? undefined,
      categoria: c.categoria ?? undefined,
      observacoes: c.observacoes ?? undefined,
      segmentoId: c.segmentoId ?? undefined,
      porte: c.porte ?? undefined,
      linkedinUrl: c.linkedinUrl ?? undefined,
      salesNavigatorUrl: c.salesNavigatorUrl ?? undefined,
      status: c.status,
    });
    setFormOpen(true);
  }

  function alternarAtivo(c: ClienteListItem) {
    startTransition(async () => {
      const res = c.ativo
        ? await desativarCliente({ id: c.id })
        : await reativarCliente({ id: c.id });
      if (res.ok) toast.success(c.ativo ? "Cliente desativado." : "Cliente reativado.");
      else toast.error(res.error);
    });
  }

  const itensDoLote = itensDeLoteClientes({ podeGerir });

  async function executarLote(item: AcaoItemAcao) {
    const desativar = item.id === ACAO_LOTE_DESATIVAR;
    if (!desativar && item.id !== ACAO_LOTE_REATIVAR) return;
    await lote.executar({
      ids: selecao.lista,
      acao: (id) => (desativar ? desativarCliente({ id }) : reativarCliente({ id })),
      substantivo: ["cliente", "clientes"],
      verbo: desativar ? ["desativado", "desativados"] : ["reativado", "reativados"],
      rotulo: nomeDe,
      confirmar: {
        titulo: (n) => `${desativar ? "Desativar" : "Reativar"} ${n} ${n === 1 ? "cliente" : "clientes"}?`,
      },
      aoConcluir: selecao.limpar,
    });
  }

  function aoSelecionarNaLinha(c: ClienteListItem, item: AcaoItemAcao) {
    if (item.id.startsWith("lote-")) {
      void executarLote(item);
      return;
    }
    if (item.id === ACAO_EDITAR) editar(c);
    else if (item.id === ACAO_ALTERNAR_ATIVO) alternarAtivo(c);
    else {
      const texto =
        item.id === ACAO_COPIAR_NOME ? c.nome : item.id === ACAO_COPIAR_DOCUMENTO ? c.documento : item.id === ACAO_COPIAR_EMAIL ? c.email : null;
      if (texto) {
        void copiarTexto(texto).then((ok) => (ok ? toast.success("Copiado.") : toast.error("Não foi possível copiar.")));
      }
    }
  }

  return (
    <div className="space-y-4">
      <DicaMenuContexto />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Clientes</h2>
          <p className="text-sm text-muted-foreground">{total} cliente(s).</p>
        </div>
        {podeGerir && (
          <div className="flex gap-2">
            <Button variant="outline" render={<a href={`/api/comercial/export/empresas?${paramsExport}`} />}>
              <Download className="size-4" /> Exportar CSV
            </Button>
            <Button onClick={novo}>
              <UserPlus className="size-4" /> Novo cliente
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full max-w-sm items-center gap-2">
          <Input
            placeholder="Buscar por nome, fantasia ou documento…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
          />
          <Button variant="outline" size="icon" onClick={buscar} aria-label="Buscar">
            <Search className="size-4" />
          </Button>
        </div>

        <Select
          value={tipo || TODOS}
          onValueChange={(v) => setParams({ tipo: v === TODOS ? null : v })}
        >
          <SelectTrigger className="h-9 w-[8rem]" aria-label="Filtrar por tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Tipo: todos</SelectItem>
            <SelectItem value="PF">PF</SelectItem>
            <SelectItem value="PJ">PJ</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={situacao || TODOS}
          onValueChange={(v) => setParams({ situacao: v === TODOS ? null : v })}
        >
          <SelectTrigger className="h-9 w-[10rem]" aria-label="Filtrar por situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Situação: todas</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>

        {ufs.length > 0 && (
          <Select
            value={uf || TODOS}
            onValueChange={(v) => setParams({ uf: v === TODOS ? null : v })}
          >
            <SelectTrigger className="h-9 w-[7rem]" aria-label="Filtrar por UF">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>UF: todas</SelectItem>
              {ufs.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {categorias.length > 0 && (
          <Select
            value={categoria || TODOS}
            onValueChange={(v) => setParams({ categoria: v === TODOS ? null : v })}
          >
            <SelectTrigger className="h-9 w-[11rem]" aria-label="Filtrar por categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Categoria: todas</SelectItem>
              {categorias.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {segmentos.length > 0 && (
          <Select
            value={segmentoId || TODOS}
            onValueChange={(v) => setParams({ segmentoId: v === TODOS ? null : v })}
          >
            <SelectTrigger className="h-9 w-[11rem]" aria-label="Filtrar por segmento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Segmento: todos</SelectItem>
              {segmentos.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={status || TODOS}
          onValueChange={(v) => setParams({ status: v === TODOS ? null : v })}
        >
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Filtrar por classificação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Classificação: todas</SelectItem>
            {opcoesDe(STATUS_COMERCIAL_LABEL).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={listaSN ? "1" : TODOS}
          onValueChange={(v) => setParams({ listaSN: v === "1" ? "1" : null })}
        >
          <SelectTrigger className="h-9 w-[10rem]" aria-label="Filtrar por lista Sales Navigator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Lista SN: todos</SelectItem>
            <SelectItem value="1">Só lista SN</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              {podeGerir && (
                <TableHead className="w-8">
                  <Checkbox
                    checked={selecao.estadoDaPagina(clientes.map((c) => c.id)) === "todos"}
                    onCheckedChange={() => selecao.alternarPagina(clientes.map((c) => c.id))}
                    aria-label="Marcar todos os clientes da página"
                  />
                </TableHead>
              )}
              <SortableHead field="nome">Nome</SortableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Classificação</TableHead>
              <TableHead>Documento</TableHead>
              <SortableHead field="cidade">Cidade/UF</SortableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Nenhum cliente.
                </TableCell>
              </TableRow>
            ) : (
              clientes.map((c) => {
                const menuItens =
                  selecao.total > 1 && selecao.marcado(c.id) ? itensDoLote : itensDeCliente(c, { podeGerir });
                return (
                <LinhaComMenu
                  key={c.id}
                  itens={menuItens}
                  onSelect={(item) => aoSelecionarNaLinha(c, item)}
                  aoAbrir={(aberto) => { if (aberto) selecao.aoAbrirMenu(c.id); }}
                  render={<TableRow data-marcada={selecao.marcado(c.id)} className={`data-[marcada=true]:bg-accent/40 data-[popup-open]:bg-muted/50 ${c.ativo ? "" : "opacity-60"}`} />}
                >
                  {podeGerir && (
                    <TableCell>
                      <Checkbox
                        checked={selecao.marcado(c.id)}
                        onCheckedChange={() => selecao.alternar(c.id)}
                        aria-label={`Selecionar ${c.nome}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    <Link href={`/clientes/${c.id}`} className="hover:underline">
                      {c.nome}
                    </Link>
                    {c.nomeFantasia && (
                      <span className="block text-xs text-muted-foreground">{c.nomeFantasia}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.tipo}</Badge>
                  </TableCell>
                  <TableCell>
                    {c.categoria ? (
                      <Badge variant="secondary">{c.categoria}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{STATUS_COMERCIAL_LABEL[c.status]}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.documento ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.cidade ? `${c.cidade}/${c.uf ?? ""}` : "—"}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs ${c.ativo ? "text-success" : "text-muted-foreground"}`}>
                      {c.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <BotaoAcoes
                      itens={menuItens}
                      onSelect={(item) => aoSelecionarNaLinha(c, item)}
                      rotulo={`Ações de ${c.nome}`}
                    />
                  </TableCell>
                </LinhaComMenu>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} />

      <BarraSelecao
        total={selecao.total}
        itens={itensDoLote}
        onSelect={(item) => void executarLote(item)}
        onLimpar={selecao.limpar}
        substantivo={["cliente", "clientes"]}
        progresso={lote.progresso}
      />
      {lote.portal}

      <ClienteForm cliente={form} open={formOpen} onOpenChange={setFormOpen} segmentos={segmentos} />
    </div>
  );
}
