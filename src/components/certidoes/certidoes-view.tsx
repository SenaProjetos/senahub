"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ShieldCheck,
  PenLine,
  Share2,
  FileSpreadsheet,
  Copy,
  Ban,
  Tags,
  ArchiveRestore,
  SearchX,
  Loader2,
} from "lucide-react";
import { formatarData, formatarDataHora } from "@/lib/utils";
import {
  statusCertidao,
  ordenarPorPrioridade,
  type PanoramaCompliance,
  type TipoObrigatorio,
} from "@/modules/certidoes/service";
import { extrairValidadeDoTexto } from "@/modules/certidoes/extrair-validade";
import { lerTextoPdf } from "@/lib/ler-texto-pdf";
import {
  criarTipoCertidao,
  editarCertidao,
  editarTipoCertidao,
  excluirCertidao,
  excluirTipoCertidao,
  restaurarCertidao,
  criarLinkCertidoes,
  atualizarLinkCertidoes,
  revogarLinkCertidoes,
} from "@/modules/certidoes/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { BotaoSelecionados } from "@/components/ui/botao-selecionados";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { useLote } from "@/components/ui/use-lote";
import { useSelecao } from "@/components/ui/use-selecao";
import {
  ACAO_BAIXAR,
  ACAO_DETALHES,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_LOTE_EXCLUIR,
  ACAO_LOTE_RENOVAR,
  ACAO_LOTE_ZIP,
  ACAO_NOVA_VERSAO,
  ACAO_VISUALIZAR,
  itensDeCertidao,
  itensDeLoteCertidoes,
  urlDoZip,
} from "@/modules/certidoes/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CertidoesResumo } from "@/components/certidoes/certidoes-resumo";
import { CertidoesConformidade } from "@/components/certidoes/certidoes-conformidade";
import { CertidoesFiltros } from "@/components/certidoes/certidoes-filtros";
import { CertidoesTabela } from "@/components/certidoes/certidoes-tabela";
import { CertidaoDrawer } from "@/components/certidoes/certidao-drawer";
import { NovaCertidaoDialog } from "@/components/certidoes/nova-certidao-dialog";
import { VisualizarDocumentoDialog } from "@/components/certidoes/visualizar-documento-dialog";
import {
  FILTROS_VAZIOS,
  contarFiltrosAtivos,
  type Aba,
  type Certidao,
  type CertidaoExcluida,
  type Filtros,
  type LinkPublico,
  type Ordem,
  type Responsavel,
  type Tipo,
} from "@/components/certidoes/tipos";

const NONE = "__none";

/** Filtro de responsável: valor especial para "quem está sem ninguém atribuído" (§9). */
const SEM_RESPONSAVEL = "__sem";

/**
 * Tela de Certidões — centro de controle da conformidade documental.
 *
 * Este componente é só o ORQUESTRADOR: segura o estado de recorte (aba, filtros, busca, ordem,
 * seleção) e decide o que abre. O desenho de cada bloco vive em arquivo próprio, como em /acessos
 * (`certidoes-resumo`, `certidoes-conformidade`, `certidoes-filtros`, `certidoes-tabela`,
 * `certidao-drawer`), senão a tela inteira viraria um arquivo de 1500 linhas.
 *
 * Filtro/busca/ordem são `useState`, não parâmetros de URL: a lista inteira já chega num único
 * carregamento do servidor, então recortar é trabalho de memória — virar navegação custaria um
 * round-trip por clique para reordenar dado que já está na mão (§24).
 */
export function CertidoesView({
  certidoes,
  excluidas,
  tipos,
  responsaveis,
  links,
  panorama,
  faltando,
  podeGerir,
}: {
  certidoes: Certidao[];
  excluidas: CertidaoExcluida[];
  tipos: Tipo[];
  responsaveis: Responsavel[];
  links: LinkPublico[];
  panorama: PanoramaCompliance;
  faltando: TipoObrigatorio[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  const [aba, setAba] = useState<Aba>("todas");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState<Ordem>("prioridade");
  // Seleção compartilhada (ADR-0002, regra 3): o menu de contexto age sobre ela. Atravessa os
  // filtros; "Selecionados (N)" mostra só os marcados, de qualquer filtro.
  const selecao = useSelecao();
  const lote = useLote();

  const [detalhe, setDetalhe] = useState<Certidao | null>(null);
  const [visualizar, setVisualizar] = useState<Certidao | null>(null);
  const [atualizarPara, setAtualizarPara] = useState<Certidao | null>(null);
  const [editar, setEditar] = useState<Certidao | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [loteAberto, setLoteAberto] = useState(false);
  const [compartilharAberto, setCompartilharAberto] = useState(false);
  const [tiposAberto, setTiposAberto] = useState(false);

  // §9/§10 — filtros e busca combinam; a ordem (§8) é aplicada depois do recorte.
  const visiveis = useMemo(() => {
    const termo = filtros.busca.trim().toLowerCase();

    const filtradas = (selecao.soSelecionados ? certidoes.filter((c) => selecao.ids.has(c.id)) : certidoes).filter((c) => {
      if (selecao.soSelecionados) return true;
      if (filtros.situacao && statusCertidao(c.validade) !== filtros.situacao) return false;

      if (filtros.documento === "com" && !c.arquivoNome) return false;
      if (filtros.documento === "sem" && c.arquivoNome) return false;

      if (filtros.obrigatoriedade === "obrigatorias" && !c.obrigatoria) return false;
      if (filtros.obrigatoriedade === "opcionais" && c.obrigatoria) return false;

      if (filtros.responsavelId === SEM_RESPONSAVEL && c.responsavelId) return false;
      if (
        filtros.responsavelId &&
        filtros.responsavelId !== SEM_RESPONSAVEL &&
        c.responsavelId !== filtros.responsavelId
      ) {
        return false;
      }

      if (filtros.tipoId && c.tipoId !== filtros.tipoId) return false;

      if (termo) {
        const alvo = [c.tipo, c.descricao ?? "", c.responsavelNome ?? ""].join(" ").toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });

    // Regra do §8 — pura e testada em `service.ts`, não reimplementada aqui.
    if (ordem === "prioridade") return ordenarPorPrioridade(filtradas);
    return [...filtradas].sort((a, b) => {
      if (ordem === "nome") return a.tipo.localeCompare(b.tipo, "pt-BR");
      const cmp = a.validade.localeCompare(b.validade);
      return ordem === "validade_desc" ? -cmp : cmp;
    });
  }, [certidoes, filtros, ordem, selecao.soSelecionados, selecao.ids]);

  const filtrosAtivos = contarFiltrosAtivos(filtros);

  function aplicarFiltro(parcial: Partial<Filtros>) {
    setAba("todas");
    setFiltros((f) => ({ ...f, ...parcial }));
  }

  function limparFiltros() {
    setFiltros(FILTROS_VAZIOS);
  }

  /** §4 — "Ver pendências": obrigatórias que não estão regulares. */
  function verPendencias() {
    setAba("todas");
    setFiltros({ ...FILTROS_VAZIOS, obrigatoriedade: "obrigatorias" });
    setOrdem("prioridade");
  }

  /** Certidões marcadas que ainda existem (a lista muda quando alguém exclui). */
  const alvosSelecao = certidoes.filter((c) => selecao.marcado(c.id));
  const itensDoLote = itensDeLoteCertidoes(alvosSelecao, { podeGerir });

  /** Uma certidão marcada dentro de uma seleção de várias mostra as ações do lote. */
  function menuDe(c: Certidao) {
    return selecao.total > 1 && selecao.marcado(c.id)
      ? itensDoLote
      : itensDeCertidao(c, { podeGerir });
  }

  async function executarLote(item: AcaoItemAcao) {
    if (item.id === ACAO_LOTE_ZIP) {
      window.open(urlDoZip(alvosSelecao.map((c) => c.id)), "_blank", "noopener");
    } else if (item.id === ACAO_LOTE_RENOVAR) {
      setLoteAberto(true);
    } else if (item.id === ACAO_LOTE_EXCLUIR) {
      const tipos = new Map(alvosSelecao.map((c) => [c.id, c.tipo]));
      await lote.executar({
        ids: alvosSelecao.map((c) => c.id),
        acao: (id) => excluirCertidao({ id }),
        substantivo: ["certidão", "certidões"],
        verbo: ["excluída", "excluídas"],
        rotulo: (id) => tipos.get(id) ?? id,
        confirmar: {
          titulo: (n) => `Excluir ${n} ${n === 1 ? "certidão" : "certidões"}?`,
          descricao: item.confirmar?.descricao,
          rotuloConfirmar: item.confirmar?.rotuloConfirmar,
          destrutivo: true,
        },
        aoConcluir: selecao.limpar,
      });
    }
  }

  /** Ação de UMA certidão (ou do lote, quando o item vem do menu de uma seleção de várias). */
  function aoSelecionarNaLinha(c: Certidao, item: AcaoItemAcao) {
    if (item.id.startsWith("lote-")) {
      void executarLote(item);
      return;
    }
    if (item.id === ACAO_DETALHES) setDetalhe(c);
    else if (item.id === ACAO_VISUALIZAR) setVisualizar(c);
    else if (item.id === ACAO_BAIXAR) window.open(`/api/certidoes/${c.id}/download`, "_blank", "noopener");
    else if (item.id === ACAO_NOVA_VERSAO) setAtualizarPara(c);
    else if (item.id === ACAO_EDITAR) setEditar(c);
    else if (item.id === ACAO_EXCLUIR) void excluir(c);
  }

  async function excluir(c: Certidao) {
    const ok = await confirm({
      title: `Excluir "${c.tipo}"?`,
      description:
        'A certidão sai da lista e dos alertas de vencimento, mas o histórico de versões e a auditoria são mantidos — dá para restaurar em "Excluídas".',
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirCertidao({ id: c.id });
      if (r.ok) {
        toast.success("Certidão excluída.");
        setDetalhe(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function restaurar(c: CertidaoExcluida) {
    start(async () => {
      const r = await restaurarCertidao({ id: c.id });
      if (r.ok) {
        toast.success("Certidão restaurada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <DicaMenuContexto />
      {/* §2 — hierarquia: título, subtítulo e a ação principal à direita. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Certidões</h2>
          <p className="text-sm text-muted-foreground">
            Controle de validade, versionamento e compartilhamento das certidões da empresa.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" render={<a href="/api/certidoes/exportar" rel="noopener" />}>
            <FileSpreadsheet className="size-3.5" aria-hidden /> Exportar
          </Button>
          {podeGerir && (
            <Button size="sm" variant="outline" onClick={() => setCompartilharAberto(true)}>
              <Share2 className="size-3.5" aria-hidden /> Compartilhar
            </Button>
          )}
          {podeGerir && (
            <Button size="sm" variant="outline" onClick={() => setTiposAberto(true)}>
              <Tags className="size-3.5" aria-hidden /> Gerenciar tipos
            </Button>
          )}
          {podeGerir && (
            <Button size="sm" onClick={() => setNovaAberta(true)}>
              <Plus className="size-3.5" aria-hidden /> Nova certidão
            </Button>
          )}
        </div>
      </div>

      <CertidoesResumo panorama={panorama} filtros={filtros} onFiltrar={aplicarFiltro} />

      <CertidoesConformidade
        certidoes={certidoes}
        faltando={faltando}
        onVerPendencias={verPendencias}
      />

      <CertidoesFiltros
        filtros={filtros}
        onFiltrar={aplicarFiltro}
        onLimpar={limparFiltros}
        aba={aba}
        onAba={setAba}
        totais={{ todas: certidoes.length, excluidas: excluidas.length, visiveis: visiveis.length }}
        ordem={ordem}
        onOrdem={setOrdem}
        tipos={tipos}
        responsaveis={responsaveis}
      />

      {podeGerir && aba === "todas" && selecao.total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <BotaoSelecionados
            total={selecao.total}
            ativo={selecao.soSelecionados}
            onChange={selecao.verSelecionados}
          />
        </div>
      )}

      {aba === "excluidas" ? (
        // §16 — lixeira: o que foi excluído, quando, por quem, e o botão de voltar atrás.
        excluidas.length === 0 ? (
          <EmptyState icon={ArchiveRestore} title="Nenhuma certidão excluída." />
        ) : (
          <ul className="divide-y rounded-sm border">
            {excluidas.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 p-3 text-sm text-muted-foreground"
              >
                <span className="font-medium text-foreground">{c.tipo}</span>
                {c.descricao && <span>{c.descricao}</span>}
                <span className="ml-auto font-mono text-xs">validade {formatarData(c.validade)}</span>
                <span className="font-mono text-[10px]">
                  excluída {formatarDataHora(c.excluidoEm)}
                  {c.excluidoPor && <> por {c.excluidoPor}</>}
                </span>
                {podeGerir && (
                  <Button size="sm" variant="ghost" onClick={() => restaurar(c)} disabled={pending}>
                    <ArchiveRestore className="size-3.5" aria-hidden /> Restaurar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )
      ) : visiveis.length === 0 ? (
        // §18 — estados vazios distintos: "nada cadastrado" pede cadastro, "nada encontrado"
        // pede limpar filtro. O mesmo texto para os dois deixaria o usuário achando que a base
        // está vazia quando só o filtro está apertado.
        certidoes.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Você ainda não cadastrou nenhuma certidão."
            description="Registre as certidões da empresa para acompanhar validade e conformidade."
            action={
              podeGerir ? (
                <Button onClick={() => setNovaAberta(true)}>
                  <Plus className="size-4" aria-hidden /> Cadastrar certidão
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="Nenhuma certidão encontrada."
            description="Revise os termos da busca ou limpe os filtros."
            action={
              filtrosAtivos > 0 ? (
                <Button variant="outline" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <CertidoesTabela
          certidoes={visiveis}
          podeGerir={podeGerir}
          selecao={selecao}
          menuDe={menuDe}
          aoSelecionar={aoSelecionarNaLinha}
          onAbrirDetalhe={setDetalhe}
          onAtualizar={setAtualizarPara}
          onEditar={setEditar}
        />
      )}

      <CertidaoDrawer
        certidao={detalhe}
        podeGerir={podeGerir}
        onClose={() => setDetalhe(null)}
        onAtualizar={(c) => {
          setDetalhe(null);
          setAtualizarPara(c);
        }}
      />
      <VisualizarDocumentoDialog
        url={visualizar ? `/api/certidoes/${visualizar.id}/download?inline=1` : null}
        titulo={visualizar?.tipo ?? ""}
        onClose={() => setVisualizar(null)}
      />
      <NovaCertidaoDialog
        aberto={novaAberta}
        onClose={() => setNovaAberta(false)}
        tipos={tipos}
        responsaveis={responsaveis}
      />
      <UploadVersaoDialog
        certidao={atualizarPara}
        onClose={() => setAtualizarPara(null)}
        onOk={() => router.refresh()}
      />
      <EditarDialog certidao={editar} responsaveis={responsaveis} onClose={() => setEditar(null)} />
      {podeGerir && aba === "todas" && (
        <BarraSelecao
          total={alvosSelecao.length}
          itens={itensDoLote}
          onSelect={(item) => void executarLote(item)}
          onLimpar={selecao.limpar}
          substantivo={["certidão", "certidões"]}
          genero="f"
          progresso={lote.progresso}
        />
      )}
      {lote.portal}
      <RenovacaoLoteDialog
        open={loteAberto}
        certidoes={alvosSelecao}
        onClose={() => setLoteAberto(false)}
        onOk={() => {
          selecao.limpar();
          router.refresh();
        }}
      />
      <CompartilharDialog
        open={compartilharAberto}
        onClose={() => setCompartilharAberto(false)}
        certidoes={certidoes}
        preSelecionadas={new Set(selecao.lista)}
        links={links}
      />
      <GerenciarTiposDialog open={tiposAberto} onClose={() => setTiposAberto(false)} tipos={tipos} />
    </div>
  );
}

function UploadVersaoDialog({
  certidao,
  onClose,
  onOk,
}: {
  certidao: Certidao | null;
  onClose: () => void;
  onOk: () => void;
}) {
  const [validade, setValidade] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [sugerida, setSugerida] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSugerida(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setLendo(true);
    try {
      const { texto, itens } = await lerTextoPdf(file);
      const achada = extrairValidadeDoTexto(texto, itens);
      if (achada) {
        setSugerida(achada);
        setValidade((atual) => atual || achada);
      }
    } catch {
      // PDF escaneado, corrompido ou falha ao carregar o leitor — sem sugestão, upload segue normal.
    } finally {
      setLendo(false);
    }
  }

  async function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!certidao || !file || !validade) return toast.error("Selecione o arquivo e informe a validade.");
    setEnviando(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("validade", validade);
    const res = await fetch(`/api/certidoes/${certidao.id}/versao`, { method: "POST", body: fd });
    const data = await res.json();
    setEnviando(false);
    if (res.ok) {
      toast.success(`Versão v${data.numero} enviada.`);
      setValidade("");
      setSugerida(null);
      onClose();
      onOk();
    } else toast.error(data.error ?? "Falha no upload.");
  }

  // §15 — "Atualizar" e "Adicionar documento" são o MESMO fluxo (nova versão); só o rótulo muda,
  // porque anexar o primeiro PDF e renovar uma certidão vencida são a mesma operação no backend.
  const primeiroAnexo = !!certidao && !certidao.arquivoNome;

  return (
    <Dialog open={!!certidao} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {primeiroAnexo ? "Adicionar documento" : "Atualizar certidão"} — {certidao?.tipo}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!primeiroAnexo && (
            <p className="rounded-sm border bg-muted/40 p-2 text-xs text-muted-foreground">
              Validade atual: <span className="font-mono">{certidao && formatarData(certidao.validade)}</span>
              . O arquivo anterior fica guardado no histórico de versões.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="versao-arquivo">Arquivo (PDF)</Label>
            <input
              id="versao-arquivo"
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="w-full text-sm"
              onChange={onFileChange}
            />
            {lendo && <p className="text-xs text-muted-foreground">Lendo PDF em busca da validade…</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="versao-validade">Nova validade</Label>
            <Input
              id="versao-validade"
              type="date"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
            />
            {sugerida && validade === sugerida && (
              <p className="text-xs text-success">Validade detectada automaticamente no PDF — confira antes de enviar.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando}>
            {enviando && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {enviando ? "Enviando…" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarDialog({
  certidao,
  responsaveis,
  onClose,
}: {
  certidao: Certidao | null;
  responsaveis: Responsavel[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [descricao, setDescricao] = useState("");
  const [responsavelId, setResponsavelId] = useState(NONE);

  function abrirComDados(c: Certidao) {
    setDescricao(c.descricao ?? "");
    setResponsavelId(c.responsavelId ?? NONE);
  }

  function salvar() {
    if (!certidao) return;
    start(async () => {
      const r = await editarCertidao({
        id: certidao.id,
        descricao,
        responsavelId: responsavelId === NONE ? "" : responsavelId,
      });
      if (r.ok) {
        toast.success("Certidão atualizada.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog
      open={!!certidao}
      onOpenChange={(o) => {
        if (o && certidao) abrirComDados(certidao);
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar — {certidao?.tipo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={responsavelId} onValueChange={(v) => setResponsavelId(v ?? NONE)}>
              <SelectTrigger>
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem responsável</SelectItem>
                {responsaveis.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenovacaoLoteDialog({
  open,
  certidoes,
  onClose,
  onOk,
}: {
  open: boolean;
  certidoes: Certidao[];
  onClose: () => void;
  onOk: () => void;
}) {
  const [validades, setValidades] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const filesRef = useRef<Record<string, File | null>>({});

  async function enviarTudo() {
    setEnviando(true);
    let ok = 0;
    let falhas = 0;
    for (const c of certidoes) {
      const file = filesRef.current[c.id];
      const validade = validades[c.id];
      if (!file || !validade) continue;
      const fd = new FormData();
      fd.set("file", file);
      fd.set("validade", validade);
      const res = await fetch(`/api/certidoes/${c.id}/versao`, { method: "POST", body: fd });
      if (res.ok) ok++;
      else falhas++;
    }
    setEnviando(false);
    if (ok > 0) toast.success(`${ok} certidão(ões) renovada(s).`);
    if (falhas > 0) toast.error(`${falhas} falharam.`);
    setValidades({});
    filesRef.current = {};
    onClose();
    onOk();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Renovação em lote</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50svh] space-y-3 overflow-y-auto">
          {certidoes.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-sm border p-2">
              <span className="min-w-0 truncate text-sm font-medium">{c.tipo}</span>
              <input
                type="file"
                accept="application/pdf"
                className="w-40 text-xs"
                onChange={(e) => (filesRef.current[c.id] = e.target.files?.[0] ?? null)}
              />
              <Input
                type="date"
                className="w-36"
                value={validades[c.id] ?? ""}
                onChange={(e) => setValidades((v) => ({ ...v, [c.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviarTudo} disabled={enviando}>
            Enviar todas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompartilharDialog({
  open,
  onClose,
  certidoes,
  preSelecionadas,
  links,
}: {
  open: boolean;
  onClose: () => void;
  certidoes: Certidao[];
  preSelecionadas: Set<string>;
  links: LinkPublico[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [expiraEm, setExpiraEm] = useState("");
  const [gerado, setGerado] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  function abrir() {
    setMarcadas(new Set(preSelecionadas));
    setExpiraEm("");
    setGerado(null);
    setEditandoId(null);
  }

  function alternar(id: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function editar(l: LinkPublico) {
    setEditandoId(l.id);
    setMarcadas(new Set(l.certidaoIds));
    setExpiraEm(l.expiraEm ? l.expiraEm.slice(0, 10) : "");
    setGerado(null);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setMarcadas(new Set());
    setExpiraEm("");
  }

  function gerar() {
    if (marcadas.size === 0) return toast.error("Selecione ao menos uma certidão.");
    const expiraIso = expiraEm ? new Date(expiraEm).toISOString() : null;
    start(async () => {
      if (editandoId) {
        const r = await atualizarLinkCertidoes({ id: editandoId, certidaoIds: [...marcadas], ativo: true, expiraEm: expiraIso });
        if (r.ok) {
          toast.success("Link atualizado.");
          cancelarEdicao();
          router.refresh();
        } else toast.error(r.error);
        return;
      }
      const r = await criarLinkCertidoes({ certidaoIds: [...marcadas], expiraEm: expiraIso });
      if (r.ok) {
        const url = `${window.location.origin}/p/certidoes/${r.data.token}`;
        setGerado(url);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function copiar(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado.");
  }

  function revogar(id: string) {
    start(async () => {
      const r = await revogarLinkCertidoes({ id });
      if (r.ok) {
        toast.success("Link revogado.");
        if (editandoId === id) cancelarEdicao();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) abrir();
        else onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compartilhar certidões (link público)</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {editandoId && (
            <div className="flex items-center justify-between rounded-sm border border-primary/40 bg-primary/5 px-2 py-1.5 text-xs">
              <span>Editando link existente — ajuste as certidões e/ou a expiração.</span>
              <Button size="sm" variant="ghost" onClick={cancelarEdicao}>
                Cancelar edição
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {marcadas.size} de {certidoes.length} selecionada(s)
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={certidoes.length === 0}
              onClick={() =>
                setMarcadas(
                  certidoes.every((c) => marcadas.has(c.id)) ? new Set() : new Set(certidoes.map((c) => c.id)),
                )
              }
            >
              {certidoes.length > 0 && certidoes.every((c) => marcadas.has(c.id))
                ? "Desmarcar todas"
                : "Selecionar todas"}
            </Button>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-sm border p-2">
            {certidoes.map((c) => (
              <label key={c.id} className="flex items-center gap-2 py-0.5 text-sm">
                <Checkbox checked={marcadas.has(c.id)} onCheckedChange={() => alternar(c.id)} />
                {c.tipo}
              </label>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Expira em (opcional)</Label>
              <Input type="date" value={expiraEm} onChange={(e) => setExpiraEm(e.target.value)} />
            </div>
            <Button onClick={gerar} disabled={pending}>
              {editandoId ? "Salvar alterações" : "Gerar link"}
            </Button>
          </div>
          {gerado && (
            <div className="flex items-center gap-2 rounded-sm border bg-muted/40 p-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-mono">{gerado}</span>
              <Button size="icon" variant="ghost" aria-label="Copiar link" onClick={() => copiar(gerado)}>
                <Copy className="size-3.5" />
              </Button>
            </div>
          )}

          {links.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Links gerados</p>
              <ul className="space-y-1.5">
                {links.map((l) => {
                  const expirado = l.expiraEm ? new Date(l.expiraEm).getTime() <= Date.now() : false;
                  const vigente = l.ativo && !expirado;
                  return (
                    <li
                      key={l.id}
                      className={`flex flex-wrap items-center gap-2 rounded-sm px-1.5 py-1 text-xs ${editandoId === l.id ? "bg-primary/5" : ""}`}
                    >
                      <Badge variant="outline" className={vigente ? "text-success border-success/40" : "text-muted-foreground"}>
                        {vigente ? "ativo" : l.ativo ? "expirado" : "revogado"}
                      </Badge>
                      <span className="text-muted-foreground">
                        {l.certidaoIds.length} certidão(ões) · gerado {formatarData(l.createdAt)}
                        {l.expiraEm ? <> · expira {formatarData(l.expiraEm)}</> : <> · sem expiração</>}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Copiar link"
                          onClick={() => copiar(`${window.location.origin}/p/certidoes/${l.token}`)}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        {l.ativo && (
                          <Button size="icon" variant="ghost" aria-label="Editar link" onClick={() => editar(l)} disabled={pending}>
                            <PenLine className="size-3.5" />
                          </Button>
                        )}
                        {l.ativo && (
                          <Button size="icon" variant="ghost" aria-label="Revogar link" onClick={() => revogar(l.id)} disabled={pending}>
                            <Ban className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GerenciarTiposDialog({ open, onClose, tipos }: { open: boolean; onClose: () => void; tipos: Tipo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novoNome, setNovoNome] = useState("");
  const [novoObrigatoria, setNovoObrigatoria] = useState(false);

  function adicionar() {
    if (!novoNome.trim()) return toast.error("Informe o nome.");
    start(async () => {
      const r = await criarTipoCertidao({ nome: novoNome, obrigatoria: novoObrigatoria });
      if (r.ok) {
        toast.success("Tipo criado.");
        setNovoNome("");
        setNovoObrigatoria(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function excluir(t: Tipo) {
    start(async () => {
      const r = await excluirTipoCertidao({ id: t.id });
      if (r.ok) {
        toast.success("Tipo excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerenciar tipos de certidão</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50svh] space-y-1.5 overflow-y-auto">
          {tipos.map((t) => (
            <TipoRow key={t.id} tipo={t} pending={pending} onExcluir={() => excluir(t)} />
          ))}
        </div>
        <div className="flex items-end gap-2 border-t pt-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Novo tipo</Label>
            <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do tipo…" />
          </div>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted-foreground">
            <Checkbox checked={novoObrigatoria} onCheckedChange={(v) => setNovoObrigatoria(v === true)} />
            Obrigatória
          </label>
          <Button size="sm" onClick={adicionar} disabled={pending}>
            <Plus className="size-3.5" /> Adicionar
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TipoRow({
  tipo,
  pending,
  onExcluir,
}: {
  tipo: Tipo;
  pending: boolean;
  onExcluir: () => void;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState(tipo.nome);
  const [obrigatoria, setObrigatoria] = useState(tipo.obrigatoria);
  const sujo = nome !== tipo.nome || obrigatoria !== tipo.obrigatoria;

  async function salvar() {
    if (!nome.trim()) return toast.error("Informe o nome.");
    setSalvando(true);
    const r = await editarTipoCertidao({ id: tipo.id, nome, obrigatoria });
    setSalvando(false);
    if (r.ok) {
      toast.success("Tipo atualizado.");
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <div className="flex items-center gap-2 rounded-sm border p-1.5">
      <Input className="h-7 flex-1" value={nome} onChange={(e) => setNome(e.target.value)} />
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <Checkbox checked={obrigatoria} onCheckedChange={(v) => setObrigatoria(v === true)} />
        Obrigatória
      </label>
      {sujo && (
        <Button size="icon-sm" variant="ghost" aria-label="Salvar" onClick={salvar} disabled={salvando}>
          <PenLine className="size-3.5" />
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" aria-label="Excluir tipo" onClick={onExcluir} disabled={pending}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
