"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileX, Plus, Share2, Upload as UploadIcon } from "lucide-react";

import {
  adicionarVersaoDocumento,
  alternarExibicaoRecebidos,
  criarDocumento,
  editarDocumento,
  excluirDocumento,
  excluirVersaoDocumento,
} from "@/modules/documentos-cliente/actions";
import type { DocumentoItem, DocumentoVersaoItem } from "@/modules/documentos-cliente/queries";
import {
  ACAO_DOC_EDITAR,
  ACAO_DOC_EXCLUIR,
  ACAO_DOC_EXIBIR_RECEBIDOS,
  ACAO_DOC_NOVA_VERSAO,
  ACAO_VERSAO_EXCLUIR,
  itensDeDocumentoArea,
  itensDeVersaoDocumento,
  type AreaDocumento,
} from "@/modules/documentos-cliente/acoes-area";
import { extDe } from "@/modules/uploads/estrutura";
import { refDocumentoDwg } from "@/modules/dwg/desenho-ref";
import { VersaoToggle } from "@/components/projetos/arquivos/versao-toggle";
import { CATEGORIAS_GERAL, subirDocumento } from "@/components/projetos/arquivos/upload-documento";
import { IconeArquivo } from "@/components/projetos/icone-arquivo";
import { PreviewPdfButton } from "@/components/pdf/preview-pdf-button";
import { VisualizarDwgButton } from "@/components/dwg/visualizar-dwg-button";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDropzone } from "@/lib/use-dropzone";
import { cn, formatarData, rotuloRevisao } from "@/lib/utils";

/**
 * Base Arquitetônica, Recebidos do cliente e Geral no formato de TABELA (reunião de 29/09/2026: "converter para a
 * tabela nova"). As três áreas guardam `Documento` com versões e sempre fizeram o mesmo — enviar, nova versão,
 * histórico de versões, excluir — mais o que é só do Geral (editar, compartilhar em Recebidos). Antes eram três
 * árvores de código quase idênticas; agora é um componente, e o que muda por área está no descritor
 * `itensDeDocumentoArea` (menu de contexto e `...` na mesma lista, ADR-0002).
 */

const TEXTO_VAZIO: Record<AreaDocumento, { titulo: string; descricao: string }> = {
  recebidos: { titulo: "Nada recebido ainda", descricao: "Material enviado pelo cliente (proposta/projeto) aparece aqui." },
  base: {
    titulo: "Nenhum arquivo na base",
    descricao: "Referência arquitetônica do projeto (ex.: base do arquiteto), visível a todas as disciplinas.",
  },
  geral: { titulo: "Sem arquivos gerais", descricao: "Contratos, memoriais, fotos e outros documentos do projeto." },
};

const ROTULO_ENVIAR: Record<AreaDocumento, string> = { recebidos: "Enviar", base: "Enviar", geral: "Novo" };

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function TabelaAreaDocumentos({
  area,
  projetoId,
  clienteId,
  documentos,
  podeGerir,
  podeExcluir,
}: {
  area: AreaDocumento;
  projetoId: string;
  clienteId: string | null;
  documentos: DocumentoItem[];
  podeGerir: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const fileNovo = useRef<HTMLInputElement>(null);
  const fileVersao = useRef<HTMLInputElement>(null);
  const [alvoVersao, setAlvoVersao] = useState<string | null>(null);
  const [versoesAbertas, setVersoesAbertas] = useState<ReadonlySet<string>>(new Set());

  // Só o Geral pede nome/categoria/descrição (enviar em silêncio criaria documento sem classificação).
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<DocumentoItem | null>(null);
  const [form, setForm] = useState({ nome: "", categoria: "outro", descricao: "" });
  /** Arquivo vindo do arrastar-e-soltar (o input só carrega o que foi escolhido no clique). */
  const [arquivoSolto, setArquivoSolto] = useState<File | null>(null);

  const origemDoUpload = area === "geral" ? "interno" : undefined;
  const origemDoDocumento = area === "geral" ? "interno" : area === "base" ? "base_arquitetonica" : "recebido_cliente";
  const alternarVersoes = (id: string) =>
    setVersoesAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function abrirNovo() {
    setArquivoSolto(null);
    setForm({ nome: "", categoria: "outro", descricao: "" });
    setNovo(true);
  }
  function abrirEditar(d: DocumentoItem) {
    setForm({ nome: d.nome, categoria: d.categoria ?? "outro", descricao: d.descricao ?? "" });
    setEditar(d);
  }

  async function enviarNovos(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    try {
      let ok = 0;
      for (const file of files) {
        try {
          const meta = await subirDocumento(file, projetoId, clienteId, origemDoUpload);
          const r = await criarDocumento({ projetoId, nome: file.name, origem: origemDoDocumento, meta });
          if (r.ok) ok += 1;
          else toast.error(`${file.name}: ${r.error}`);
        } catch (e) {
          toast.error(`${file.name}: ${(e as Error).message}`);
        }
      }
      if (ok > 0) toast.success(area === "recebidos" ? `${ok} documento(s) recebido(s).` : `${ok} arquivo(s) enviado(s).`);
      router.refresh();
    } finally {
      setBusy(false);
      if (fileNovo.current) fileNovo.current.value = "";
    }
  }

  async function salvarNovo() {
    const file = arquivoSolto ?? fileNovo.current?.files?.[0];
    if (!form.nome.trim() || !file) {
      toast.error("Informe o nome e selecione um arquivo.");
      return;
    }
    setBusy(true);
    try {
      const meta = await subirDocumento(file, projetoId, clienteId, "interno");
      const r = await criarDocumento({ projetoId, nome: form.nome, categoria: form.categoria, descricao: form.descricao, origem: "interno", meta });
      if (r.ok) {
        toast.success("Arquivo enviado.");
        setNovo(false);
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function salvarEdicao() {
    if (!editar || !form.nome.trim()) return;
    start(async () => {
      const r = await editarDocumento({ id: editar.id, nome: form.nome, categoria: form.categoria, descricao: form.descricao });
      if (r.ok) {
        toast.success("Arquivo atualizado.");
        setEditar(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function enviarVersao(documentoId: string, file: File) {
    setBusy(true);
    try {
      const meta = await subirDocumento(file, projetoId, clienteId, origemDoUpload);
      const r = await adicionarVersaoDocumento({ documentoId, meta });
      if (r.ok) {
        toast.success(`Versão ${r.data.numero} adicionada.`);
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setAlvoVersao(null);
    }
  }

  // Arrastar-e-soltar: Recebidos e Base enviam direto; o Geral abre o formulário com o arquivo já escolhido.
  const { arrastando, dropProps } = useDropzone((files) => {
    if (area === "geral") {
      const f = files[0];
      if (!f) return;
      setArquivoSolto(f);
      setForm({ nome: f.name, categoria: "outro", descricao: "" });
      setNovo(true);
    } else void enviarNovos(files);
  }, !podeGerir || busy);

  /**
   * O que cada item do menu faz (o descritor é `itensDeDocumentoArea`). O `confirm` vem ANTES de qualquer gravação e
   * nenhuma passa por `startTransition` com o confirm dentro: ele trava o React 19.
   */
  async function aoAcaoDocumento(d: DocumentoItem, item: AcaoItemAcao) {
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar ?? "Confirmar",
        variant: item.variant === "destructive" ? "destructive" : undefined,
      });
      if (!ok) return;
    }
    switch (item.id) {
      case ACAO_DOC_NOVA_VERSAO:
        setAlvoVersao(d.id);
        fileVersao.current?.click();
        return;
      case ACAO_DOC_EDITAR:
        abrirEditar(d);
        return;
      case ACAO_DOC_EXIBIR_RECEBIDOS:
        start(async () => {
          const r = await alternarExibicaoRecebidos({ id: d.id, exibir: !d.exibirEmRecebidos });
          if (r.ok) {
            toast.success(r.data.exibir ? "Compartilhado em Recebidos do cliente." : "Removido de Recebidos do cliente.");
            router.refresh();
          } else toast.error(r.error);
        });
        return;
      case ACAO_DOC_EXCLUIR:
        start(async () => {
          const r = await excluirDocumento({ id: d.id });
          if (r.ok) router.refresh();
          else toast.error(r.error);
        });
        return;
    }
  }

  async function aoAcaoVersao(v: DocumentoVersaoItem, item: AcaoItemAcao) {
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar ?? "Confirmar",
        variant: "destructive",
      });
      if (!ok) return;
    }
    if (item.id === ACAO_VERSAO_EXCLUIR) {
      start(async () => {
        const r = await excluirVersaoDocumento({ versaoId: v.id });
        if (r.ok) {
          toast.success("Versão excluída.");
          router.refresh();
        } else toast.error(r.error);
      });
    }
  }

  const colunaCategoria = area === "geral";
  const vazio = TEXTO_VAZIO[area];

  return (
    <div className={cn("space-y-2 rounded-sm transition-colors", arrastando && "bg-primary/5 ring-1 ring-primary")} {...(podeGerir ? dropProps : {})}>
      <input
        ref={fileVersao}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && alvoVersao) void enviarVersao(alvoVersao, f);
          e.target.value = "";
        }}
      />
      {area !== "geral" && (
        <input ref={fileNovo} type="file" multiple className="hidden" onChange={(e) => void enviarNovos(Array.from(e.target.files ?? []))} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-muted-foreground">
          {documentos.length} arquivo{documentos.length === 1 ? "" : "s"}
          {podeGerir && " · arraste arquivos para cá"}
        </p>
        {podeGerir && (
          <Button size="sm" onClick={area === "geral" ? abrirNovo : () => fileNovo.current?.click()} disabled={busy}>
            {area === "geral" ? <Plus className="size-3.5" /> : <UploadIcon className="size-3.5" />}
            {busy ? "Enviando…" : ROTULO_ENVIAR[area]}
          </Button>
        )}
      </div>

      {documentos.length === 0 ? (
        <div className="rounded-sm border border-dashed">
          <EmptyState icon={FileX} title={vazio.titulo} description={vazio.descricao} className="py-10" />
        </div>
      ) : (
        <div className="min-w-0 rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">Nome</TableHead>
                {colunaCategoria && <TableHead>Categoria</TableHead>}
                <TableHead className="text-right">Tamanho</TableHead>
                <TableHead>Enviado em</TableHead>
                <TableHead>Enviado por</TableHead>
                <TableHead>
                  <span className="sr-only">Visualizar</span>
                </TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documentos.map((d) => {
                const anteriores = d.versoes.slice(1);
                const aberto = versoesAbertas.has(d.id);
                const itens = itensDeDocumentoArea(
                  { nome: d.nome, origem: d.origem, exibirEmRecebidos: d.exibirEmRecebidos, downloadUrl: d.atual?.downloadUrl ?? null, totalVersoes: d.totalVersoes },
                  { area, podeGerir, podeExcluir },
                );
                return (
                  <Fragment key={d.id}>
                    <LinhaComMenu itens={itens} onSelect={(item) => void aoAcaoDocumento(d, item)} render={<TableRow />}>
                      <TableCell className="max-w-[32rem]">
                        <div className="flex min-w-0 items-center gap-2">
                          <IconeArquivo nome={d.atual?.nomeArquivo ?? d.nome} />
                          <span className="min-w-0 truncate" title={d.nome}>
                            {d.nome}
                          </span>
                          {d.totalVersoes > 1 && <span className="shrink-0 font-mono text-xs text-muted-foreground">v{d.atual?.numero}</span>}
                          {anteriores.length > 0 && (
                            <VersaoToggle n={anteriores.length} aberto={aberto} onClick={() => alternarVersoes(d.id)} nome={d.nome} />
                          )}
                          {d.origem === "interno" && area === "recebidos" && (
                            <Badge variant="secondary" className="shrink-0 gap-1" title="Compartilhado da pasta Geral (gerido lá)">
                              <Share2 className="size-3" /> do Geral
                            </Badge>
                          )}
                          {area === "recebidos" && d.origem !== "interno" && d.canal !== "interno" && (
                            <Badge variant="outline" className="shrink-0 capitalize">
                              {d.canal}
                            </Badge>
                          )}
                          {area === "geral" && d.exibirEmRecebidos && (
                            <Badge variant="secondary" className="shrink-0 gap-1">
                              <Share2 className="size-3" /> em Recebidos
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      {colunaCategoria && (
                        <TableCell>
                          {d.categoria && (
                            <Badge variant="outline" className="capitalize">
                              {d.categoria}
                            </Badge>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {d.atual ? fmtBytes(d.atual.tamanho) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatarData(d.atual?.criadoEm ?? d.criadoEm)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.autor}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          {d.atual && <PreviewPdfButton visivel={extDe(d.atual.nomeArquivo) === "pdf"} url={d.atual.downloadUrl} titulo={d.nome} />}
                          {d.atual && (
                            <VisualizarDwgButton desenhoId={refDocumentoDwg(d.atual.id)} nomeArquivo={d.atual.nomeArquivo} titulo={d.nome} statusInicial={d.atual.conversaoDwg} />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <BotaoAcoes itens={itens} onSelect={(item) => void aoAcaoDocumento(d, item)} rotulo={`Ações de ${d.nome}`} />
                      </TableCell>
                    </LinhaComMenu>
                    {aberto &&
                      anteriores.map((v) => {
                        const itensVersao = itensDeVersaoDocumento(v, { podeExcluir: podeExcluir && !(area === "recebidos" && d.origem === "interno") });
                        return (
                          <LinhaComMenu key={v.id} itens={itensVersao} onSelect={(item) => void aoAcaoVersao(v, item)} render={<TableRow className="bg-muted/20 text-muted-foreground" />}>
                            <TableCell className="pl-10">
                              <div className="flex min-w-0 items-center gap-2">
                                <IconeArquivo nome={v.nomeArquivo} />
                                <span className="min-w-0 truncate" title={v.nomeArquivo}>
                                  {d.nome}
                                </span>
                                <span className="shrink-0 font-mono text-xs">v{v.numero}</span>
                              </div>
                            </TableCell>
                            {colunaCategoria && <TableCell />}
                            <TableCell className="text-right font-mono text-xs tabular-nums">{fmtBytes(v.tamanho)}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{formatarData(v.criadoEm)}</TableCell>
                            <TableCell />
                            <TableCell>
                              <div className="flex items-center justify-end gap-1.5">
                                <PreviewPdfButton visivel={extDe(v.nomeArquivo) === "pdf"} url={v.downloadUrl} titulo={`${d.nome} ${rotuloRevisao(v.numero)}`} />
                                <VisualizarDwgButton desenhoId={refDocumentoDwg(v.id)} nomeArquivo={v.nomeArquivo} titulo={`${d.nome} ${rotuloRevisao(v.numero)}`} statusInicial={v.conversaoDwg} />
                              </div>
                            </TableCell>
                            <TableCell>
                              <BotaoAcoes itens={itensVersao} onSelect={(item) => void aoAcaoVersao(v, item)} rotulo={`Ações da versão ${v.numero} de ${d.nome}`} />
                            </TableCell>
                          </LinhaComMenu>
                        );
                      })}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {area === "geral" && (
        <>
          {/* Novo arquivo geral */}
          <Dialog open={novo} onOpenChange={(o) => !o && setNovo(false)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Novo arquivo geral</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <CamposDoGeral form={form} setForm={setForm} placeholderNome="Contrato assinado" />
                <div className="space-y-1.5">
                  <Label>Arquivo</Label>
                  {arquivoSolto ? (
                    // Arquivo veio arrastado: o input de arquivo não pode ser preenchido por código, então
                    // mostramos o nome e deixamos trocar.
                    <div className="flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-sm">
                      <IconeArquivo nome={arquivoSolto.name} />
                      <span className="min-w-0 flex-1 truncate" title={arquivoSolto.name}>
                        {arquivoSolto.name}
                      </span>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setArquivoSolto(null)}>
                        Trocar
                      </Button>
                    </div>
                  ) : (
                    <Input ref={fileNovo} type="file" />
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNovo(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => void salvarNovo()} disabled={busy}>
                  {busy ? "Enviando…" : "Enviar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Editar metadados */}
          <Dialog open={!!editar} onOpenChange={(o) => !o && setEditar(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Editar arquivo</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <CamposDoGeral form={form} setForm={setForm} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditar(null)}>
                  Cancelar
                </Button>
                <Button onClick={salvarEdicao} disabled={pending}>
                  {pending ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

type FormGeral = { nome: string; categoria: string; descricao: string };

function CamposDoGeral({
  form,
  setForm,
  placeholderNome,
}: {
  form: FormGeral;
  setForm: (f: FormGeral) => void;
  placeholderNome?: string;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Nome</Label>
        <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder={placeholderNome} />
      </div>
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v ?? "outro" })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS_GERAL.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Descrição (opcional)</Label>
        <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
      </div>
    </>
  );
}
