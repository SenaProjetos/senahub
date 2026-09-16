"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FolderOpen, Trash2, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { foraDoPadrao } from "@/modules/projetos/pranchas/codigo";
import type { PastaFlat } from "@/modules/projetos/pastas/arvore";
import { TAMANHO_MAX_BACKUP_LABEL, TAMANHO_MAX_LABEL, limiteDoPacote, limiteLabelDoPacote } from "@/modules/uploads/limites";
import { detectarNovasRevisoes, mensagemNovasRevisoes, type ArquivoExistente } from "@/modules/uploads/revisao-nova";
import { gruposRevisaoAgrupada } from "@/modules/uploads/revisao-agrupada";
import { enviarArquivoComProgresso, ErroEnvio, PainelProgressoEnvio, type LinhaEnvio } from "@/components/projetos/upload-progresso";
import { SeletorPasta } from "@/components/projetos/pasta-tree-view";
import { Button } from "@/components/ui/button";
import { CorrecaoNomeUpload, type DadosCorrecaoNomeUpload } from "@/components/projetos/arquivos/correcao-nome-upload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, rotuloRevisao } from "@/lib/utils";
import { useDropzone } from "@/lib/use-dropzone";
import {
  confiavel,
  interpretarNomeArquivo,
  type Aviso,
  type Sugestao,
} from "@/modules/uploads/nomenclatura/interpretar";
import { montarVocabulario, type CatalogosNomenclatura } from "@/modules/uploads/nomenclatura/vocabulario";
import type { ExtensaoDef } from "@/modules/uploads/nomenclatura/extensoes";
import { editarMetadadosDocumento } from "@/modules/uploads/actions";

type PacoteEnvio = "A" | "B";
type FaseUpload = { id: string; sigla: string; nome: string };
type ItemEnvio = {
  file: File;
  nome: string;
  alvo: PacoteEnvio;
  pastaId?: string;
  faseId?: string;
  /** Tipo de documento lido do nome (alta confiança) ou escolhido aqui. */
  tipoId?: string;
  /** Título da prancha pra Lista Mestre — preenchido aqui já deixa o envio alimentando a
   *  Lista Mestre sozinho, sem passo extra depois no painel de detalhe. */
  titulo?: string;
  /** "Nova versão de": documento existente que recebe esta revisão, mesmo com outro nome. */
  versaoDeDocumentoId?: string;
  fora: boolean;
  /** Avisos e sugestões do motor de nomenclatura, para a etapa de revisão. */
  avisos: Aviso[];
  sugestoes: Sugestao[];
};
type LinhaEnvioComArquivo = ItemEnvio & LinhaEnvio & {
  grupoRevisao?: string;
  revisaoAgrupadaId?: string;
};

/**
 * Documento vivo que pode receber uma nova versão. `local` é o pacote (`A`/`B`/`OUTROS`) ou
 * `pasta:<id>` — o destino do envio tem de ser o mesmo, senão a rota recusa (um documento não
 * pode ter versões em pacote e em pasta ao mesmo tempo).
 */
export type DocumentoExistente = { id: string; nomeArquivo: string; local: string };

export type DadosEnviarDocumentos = {
  disciplinas: {
    id: string;
    nome: string;
    sigla: string | null;
    usaPastas: boolean;
    pastas: PastaFlat[];
    /** Id no `DisciplinaCatalogo` — o motor compara com a disciplina lida do nome. */
    catalogoId: string | null;
  }[];
  nomenclatura: { exigir: boolean; exigirFase: boolean; padrao: string | null };
  existentesPorDisciplina: Record<string, ArquivoExistente[]>;
  fases: FaseUpload[];
  tipos: FaseUpload[];
  codigoProjeto: string;
  projeto: { id: string; codigo: string; ano: number; sequencial: number };
  catalogosNomenclatura: CatalogosNomenclatura;
  extensoesNomenclatura: ExtensaoDef[];
  documentosPorDisciplina: Record<string, DocumentoExistente[]>;
  /** Sem isto, o editor de fase/tipo pós-envio nem aparece — evita chamar uma action que o
   *  servidor recusaria por permissão. */
  podeEditarMetadados: boolean;
};

/**
 * Mesmo fluxo de upload da aba legada, na superfície V2: disciplina/pasta ou pacote,
 * dropzone, aviso de revisão e progresso individual por arquivo. A rota continua sendo
 * a única dona da persistência (`POST /api/uploads`).
 */
export function EnviarDocumentosDialog({ dados }: { dados: DadosEnviarDocumentos }) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximoAberto) => {
        if (!enviando) setAberto(proximoAberto);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <UploadIcon className="size-3.5" /> Enviar documentos
          </Button>
        }
      />
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-3xl"
        showCloseButton={!enviando}
      >
        <DialogHeader>
          <DialogTitle>Enviar documentos</DialogTitle>
          <DialogDescription>
            Escolha a disciplina e o destino antes de selecionar ou arrastar os arquivos.
          </DialogDescription>
        </DialogHeader>
        <UploaderDocumentos dados={dados} onEnviarChange={setEnviando} />
      </DialogContent>
    </Dialog>
  );
}

function UploaderDocumentos({
  dados,
  onEnviarChange,
}: {
  dados: DadosEnviarDocumentos;
  onEnviarChange: (enviando: boolean) => void;
}) {
  const router = useRouter();
  const [disciplinaId, setDisciplinaId] = useState("");
  const [pacote, setPacote] = useState<PacoteEnvio>("A");
  const [pastaId, setPastaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pendentes, setPendentes] = useState<ItemEnvio[] | null>(null);
  const [progresso, setProgresso] = useState<LinhaEnvioComArquivo[] | null>(null);
  const inputArquivos = useRef<HTMLInputElement>(null);
  const inputPasta = useRef<HTMLInputElement>(null);

  const disciplina = dados.disciplinas.find((item) => item.id === disciplinaId);
  const usaPastas = disciplina?.usaPastas ?? false;
  // Vocabulário do projeto (siglas + sinônimos dos catálogos), montado uma vez por diálogo.
  // O escopo é o projeto — o MESMO que a rota usa. Passar `null` aqui descartaria as siglas
  // próprias do projeto e a tela mostraria "—" num campo que o servidor preencheria.
  const vocabulario = useMemo(
    () => montarVocabulario(dados.catalogosNomenclatura, dados.projeto.id),
    [dados.catalogosNomenclatura, dados.projeto.id],
  );
  const { arrastando, dropProps } = useDropzone((files) => prepararEnvio(files), enviando);

  function selecionarDisciplina(id: string) {
    setDisciplinaId(id);
    setPastaId("");
  }

  function prepararEnvio(lista: FileList | File[] | null) {
    if (!disciplinaId) {
      toast.error("Selecione a disciplina.");
      return;
    }
    if (usaPastas && !pastaId) {
      toast.error("Selecione a pasta de destino.");
      return;
    }

    const files = lista ? Array.from(lista) : [];
    if (files.length === 0) return;

    const itens: ItemEnvio[] = [];
    const limite = limiteDoPacote(usaPastas ? "" : pacote);
    // Só documentos do MESMO destino podem receber nova versão (ver `DocumentoExistente`).
    const localAtual = usaPastas ? `pasta:${pastaId}` : pacote;
    const documentosDoDestino = (dados.documentosPorDisciplina[disciplinaId] ?? []).filter(
      (documento) => documento.local === localAtual,
    );
    for (const file of files) {
      if (file.size > limite) {
        toast.error(`${file.name}: excede o limite de ${limiteLabelDoPacote(usaPastas ? "" : pacote)}.`);
        continue;
      }
      // Motor de nomenclatura: a MESMA leitura que a rota faz no servidor. Aqui ela serve para
      // mostrar (e deixar corrigir) antes de enviar; lá, para gravar. Só confiança alta
      // preenche sozinha (D7) — o resto vira aviso/sugestão nesta tela.
      const leitura = interpretarNomeArquivo(file.name, {
        projeto: dados.projeto,
        disciplinaCatalogoId: disciplina?.catalogoId ?? null,
        padrao: dados.nomenclatura.padrao,
        vocabulario,
        extensoes: dados.extensoesNomenclatura,
        documentosExistentes: documentosDoDestino,
      });
      itens.push({
        file,
        nome: file.name,
        alvo: pacote,
        ...(usaPastas ? { pastaId } : {}),
        ...(confiavel(leitura.fase) ? { faseId: leitura.fase.valor } : {}),
        ...(confiavel(leitura.tipo) ? { tipoId: leitura.tipo.valor } : {}),
        // Feedback de padrão sempre visível — `exigir` fica reservado pro dia em que virar
        // bloqueio de verdade; até lá, a equipe já vê e vai se adaptando (pedido do dono).
        fora: !usaPastas && pacote === "A" && foraDoPadrao(file.name, dados.nomenclatura.padrao),
        avisos: leitura.avisos,
        sugestoes: leitura.sugestoes,
      });
    }
    if (itens.length === 0) return;

    // Revisar antes de enviar sempre que houver o que decidir: nome fora do padrão, fase
    // obrigatória, ou qualquer aviso/sugestão do motor (projeto divergente, backup, cópia…).
    const temOQueRevisar = itens.some((item) => item.fora || item.avisos.length > 0 || item.sugestoes.length > 0);
    if (temOQueRevisar || dados.nomenclatura.exigirFase) {
      setPendentes(itens);
      return;
    }
    void enviar(itens);
  }

  async function enviar(itens: ItemEnvio[]) {
    setPendentes(null);
    const revisoes = detectarNovasRevisoes(
      itens.map((item) => item.nome),
      dados.existentesPorDisciplina[disciplinaId] ?? [],
      usaPastas ? { pastaId } : { pacote: itens[0]?.alvo },
    );
    if (revisoes.length > 0) toast.info(mensagemNovasRevisoes(revisoes), { duration: 6000 });

    const grupos = gruposRevisaoAgrupada(itens.map((item) => ({
      nome: item.nome,
      pacote: usaPastas ? null : item.alvo,
      pastaId: item.pastaId ?? null,
    })));
    const grupoPorIndice = new Map<number, string>(
      grupos.flatMap((grupo) => grupo.indices.map((indice): [number, string] => [indice, grupo.chave])),
    );
    const revisoesPorGrupo = new Map<string, { id: string; numero: number }>();
    const gruposComErro = new Set<string>();
    const enviadosPorGrupo = new Map<string, number>();

    const linhas: LinhaEnvioComArquivo[] = itens.map((item, indice) => ({
      ...item,
      tamanho: item.file.size,
      status: "pendente",
      progresso: 0,
      grupoRevisao: grupoPorIndice.get(indice),
    }));
    setProgresso(linhas);
    setEnviando(true);
    onEnviarChange(true);
    try {
      let enviados = 0;
      let realocados = 0;
      for (let i = 0; i < linhas.length; i++) {
        const grupo = grupoPorIndice.get(i);
        if (grupo && gruposComErro.has(grupo)) {
          atualizarLinha(i, { status: "erro", motivo: "Não foi possível iniciar a revisão conjunta deste documento." });
          continue;
        }
        atualizarLinha(i, { status: "enviando" });
        try {
          const revisaoDoGrupo = grupo ? revisoesPorGrupo.get(grupo) : undefined;
          const resultado = await enviarArquivoComProgresso(
            linhas[i].file,
            {
              nome: linhas[i].nome,
              disciplinaId,
              faseId: linhas[i].faseId,
              tipoId: linhas[i].tipoId,
              versaoDeDocumentoId: linhas[i].versaoDeDocumentoId,
              ...(linhas[i].pastaId ? { pastaId: linhas[i].pastaId } : { pacote: linhas[i].alvo }),
              ...(grupo
                ? revisaoDoGrupo
                  ? { revisaoDeId: revisaoDoGrupo.id }
                  : { novaRevisaoAgrupada: true }
                : {}),
            },
            (pct) => atualizarLinha(i, { progresso: pct }),
          );
          if (resultado.ok) {
            enviados += 1;
            if (resultado.realocado) realocados += 1;
            if (grupo && resultado.revisaoId && resultado.revisaoNumero !== undefined) {
              revisoesPorGrupo.set(grupo, { id: resultado.revisaoId, numero: resultado.revisaoNumero });
              enviadosPorGrupo.set(grupo, (enviadosPorGrupo.get(grupo) ?? 0) + 1);
            }
            atualizarLinha(i, {
              status: "ok",
              progresso: 100,
              realocado: resultado.realocado,
              revisaoAgrupadaId: grupo ? resultado.revisaoId : undefined,
              retryAfterAt: undefined,
              // Confirmado pelo servidor — pode diferir do que a leitura local sugeriu (o
              // documento já podia ter fase/tipo de um envio anterior, que sempre vence).
              documentoId: resultado.documentoId,
              faseId: resultado.faseId,
              tipoId: resultado.tipoId,
              numeroPrancha: resultado.numeroPrancha,
            });
          } else {
            if (grupo) gruposComErro.add(grupo);
          atualizarLinha(i, { status: "erro", motivo: resultado.motivo ?? "Falha ao salvar." });
          }
        } catch (error) {
          if (grupo) gruposComErro.add(grupo);
          const espera = error instanceof ErroEnvio ? error.retryDepoisSegundos : undefined;
          atualizarLinha(i, {
            status: "erro",
            motivo: (error as Error).message,
            retryAfterAt: espera ? Date.now() + espera * 1_000 : undefined,
          });
        }
      }
      if (enviados > 0) toast.success(`${enviados} arquivo(s) enviado(s).`);
      for (const [grupo, total] of enviadosPorGrupo) {
        const revisao = revisoesPorGrupo.get(grupo);
        if (total > 1 && revisao) toast.success(`${total} arquivos foram enviados juntos na revisão ${rotuloRevisao(revisao.numero)}.`);
      }
      if (realocados > 0) toast.info(`${realocados} arquivo(s) não suportado(s) foram para "Outros".`);
      router.refresh();
    } finally {
      setEnviando(false);
      onEnviarChange(false);
      if (inputArquivos.current) inputArquivos.current.value = "";
      if (inputPasta.current) inputPasta.current.value = "";
    }
  }

  function atualizarLinha(indice: number, patch: Partial<LinhaEnvioComArquivo>) {
    setProgresso((atual) => {
      if (!atual) return atual;
      return atual.map((linha, i) => (i === indice ? { ...linha, ...patch } : linha));
    });
  }

  // Corrigir fase/tipo reconhecidos SEM sair da tela de envio (senão o único jeito era fechar
  // o diálogo, achar o documento na lista e abrir o painel de detalhe pra cada arquivo).
  const [salvandoMetadado, setSalvandoMetadado] = useState<number | null>(null);
  const [, iniciarSalvarMetadado] = useTransition();

  /** Título digitado aqui alimenta a Lista Mestre direto — sem isto, era mais um passo depois,
   *  no painel de detalhe de cada documento (pedido do dono: já ir preenchendo no envio). */
  // Por documentoId, não por índice: um novo lote no MESMO diálogo reindexa `progresso` do
  // zero, e um ref por índice guardaria o título do lote anterior — o próximo save igual ao
  // "salvo" fantasma seria descartado pela guarda de "nada mudou" (achado do advisor).
  const tituloSalvo = useRef(new Map<string, string>());

  function salvarTituloPosEnvio(indice: number, tituloDigitado: string) {
    const linha = progresso?.[indice];
    if (!linha?.documentoId) return;
    const documentoId = linha.documentoId;
    const valor = tituloDigitado.trim();
    if (valor === (tituloSalvo.current.get(documentoId) ?? "")) return; // nada mudou — não bate a action à toa no blur
    atualizarLinha(indice, { titulo: valor || undefined });
    setSalvandoMetadado(indice);
    iniciarSalvarMetadado(async () => {
      const r = await editarMetadadosDocumento({ documentoId, titulo: valor || null });
      setSalvandoMetadado(null);
      if (r.ok) tituloSalvo.current.set(documentoId, valor);
      else toast.error(r.error);
    });
  }

  function salvarMetadadoPosEnvio(indice: number, campo: "faseId" | "tipoId", valorBruto: string) {
    const linha = progresso?.[indice];
    if (!linha?.documentoId) return;
    const documentoId = linha.documentoId;
    const anterior = campo === "faseId" ? linha.faseId : linha.tipoId;
    const valor = valorBruto === "__none" ? "" : valorBruto;
    const novoValor = valor || undefined;
    atualizarLinha(indice, campo === "faseId" ? { faseId: novoValor } : { tipoId: novoValor });
    setSalvandoMetadado(indice);
    iniciarSalvarMetadado(async () => {
      const r = await editarMetadadosDocumento(
        campo === "faseId" ? { documentoId, faseId: valor || null } : { documentoId, tipoId: valor || null },
      );
      setSalvandoMetadado(null);
      if (!r.ok) {
        toast.error(r.error);
        atualizarLinha(indice, campo === "faseId" ? { faseId: anterior } : { tipoId: anterior }); // desfaz o otimista
      }
    });
  }

  async function reenviar(indices: number[]) {
    const atuais = progresso;
    if (enviando || !atuais || indices.length === 0) return;
    const indicesEfetivos = new Set<number>();
    for (const indice of indices) {
      const linha = atuais[indice];
      if (!linha || linha.status !== "erro") continue;
      const haRevisaoDoGrupo = linha.grupoRevisao && atuais.some(
        (outra) => outra.grupoRevisao === linha.grupoRevisao && !!outra.revisaoAgrupadaId,
      );
      if (linha.grupoRevisao && !haRevisaoDoGrupo) {
        atuais.forEach((outra, outroIndice) => {
          if (outra.grupoRevisao === linha.grupoRevisao && outra.status === "erro") indicesEfetivos.add(outroIndice);
        });
      } else {
        indicesEfetivos.add(indice);
      }
    }
    if (indicesEfetivos.size === 0) return;

    const revisoesPorGrupo = new Map<string, { id: string; numero: number }>();
    atuais.forEach((linha) => {
      if (linha.grupoRevisao && linha.revisaoAgrupadaId) {
        revisoesPorGrupo.set(linha.grupoRevisao, { id: linha.revisaoAgrupadaId, numero: 0 });
      }
    });
    setEnviando(true);
    onEnviarChange(true);
    try {
      for (const indice of [...indicesEfetivos].sort((a, b) => a - b)) {
        const linha = atuais[indice];
        if (!linha) continue;
        atualizarLinha(indice, { status: "enviando", progresso: 0, motivo: undefined, retryAfterAt: undefined });
        const revisao = linha.grupoRevisao ? revisoesPorGrupo.get(linha.grupoRevisao) : undefined;
        try {
          const resultado = await enviarArquivoComProgresso(
            linha.file,
            {
              nome: linha.nome,
              disciplinaId,
              faseId: linha.faseId,
              tipoId: linha.tipoId,
              versaoDeDocumentoId: linha.versaoDeDocumentoId,
              ...(linha.pastaId ? { pastaId: linha.pastaId } : { pacote: linha.alvo }),
              ...(linha.grupoRevisao
                ? revisao
                  ? { revisaoDeId: revisao.id }
                  : { novaRevisaoAgrupada: true }
                : {}),
            },
            (pct) => atualizarLinha(indice, { progresso: pct }),
          );
          if (!resultado.ok) {
            atualizarLinha(indice, { status: "erro", motivo: resultado.motivo ?? "Falha ao salvar." });
            continue;
          }
          if (linha.grupoRevisao && resultado.revisaoId) {
            revisoesPorGrupo.set(linha.grupoRevisao, { id: resultado.revisaoId, numero: resultado.revisaoNumero ?? 0 });
          }
          atualizarLinha(indice, {
            status: "ok",
            progresso: 100,
            realocado: resultado.realocado,
            revisaoAgrupadaId: linha.grupoRevisao ? resultado.revisaoId : undefined,
            documentoId: resultado.documentoId,
            faseId: resultado.faseId,
            tipoId: resultado.tipoId,
            numeroPrancha: resultado.numeroPrancha,
          });
        } catch (error) {
          const espera = error instanceof ErroEnvio ? error.retryDepoisSegundos : undefined;
          atualizarLinha(indice, {
            status: "erro",
            motivo: (error as Error).message,
            retryAfterAt: espera ? Date.now() + espera * 1_000 : undefined,
          });
        }
      }
      router.refresh();
    } finally {
      setEnviando(false);
      onEnviarChange(false);
    }
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-md border border-dashed p-3 transition-colors",
        arrastando && "border-primary bg-primary/5",
      )}
      {...dropProps}
    >
      <RevisarNomesDialog
        itens={pendentes}
        exigirFase={dados.nomenclatura.exigirFase}
        fases={dados.fases}
        tipos={dados.tipos}
        dadosCorrecao={disciplina ? {
          codigoProjeto: dados.codigoProjeto,
          siglaDisciplina: disciplina.sigla,
          fases: dados.fases,
          tipos: dados.tipos,
        } : null}
        padrao={dados.nomenclatura.padrao}
        onCancel={() => setPendentes(null)}
        onChange={setPendentes}
        onConfirm={() => pendentes && void enviar(pendentes)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={disciplinaId} onValueChange={(value) => value && selecionarDisciplina(value)}>
          <SelectTrigger className={cn("w-52", !disciplinaId && "text-muted-foreground")}>
            <SelectValue placeholder="Selecione a disciplina…" />
          </SelectTrigger>
          <SelectContent>
            {dados.disciplinas.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!disciplinaId ? (
          <Select<string> disabled>
            <SelectTrigger className="w-44 text-muted-foreground">
              <SelectValue placeholder="Selecione a disciplina…" />
            </SelectTrigger>
            <SelectContent />
          </Select>
        ) : usaPastas ? (
          <SeletorPasta pastas={disciplina!.pastas} value={pastaId} onChange={setPastaId} />
        ) : (
          <Select value={pacote} onValueChange={(value) => value && setPacote(value as PacoteEnvio)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">Pranchas e arquivos</SelectItem>
              <SelectItem value="B">Backup do modelo</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Button
          size="sm"
          variant="outline"
          disabled={enviando || !disciplinaId || (usaPastas && !pastaId)}
          onClick={() => inputArquivos.current?.click()}
        >
          <UploadIcon className="size-3.5" /> Arquivos
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={enviando || !disciplinaId || (usaPastas && !pastaId)}
          onClick={() => inputPasta.current?.click()}
        >
          <FolderOpen className="size-3.5" /> Pasta
        </Button>

        <input ref={inputArquivos} type="file" multiple className="hidden" onChange={(event) => prepararEnvio(event.target.files)} />
        <input
          ref={inputPasta}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => prepararEnvio(event.target.files)}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
      </div>

      {progresso && progresso.length > 0 && (
        <PainelProgressoEnvio
          linhas={progresso}
          enviando={enviando}
          onFechar={() => setProgresso(null)}
          onReenviar={(indices) => void reenviar(indices)}
        />
      )}

      {/* Fase/tipo/título reconhecidos ou a preencher, ainda nesta tela — sem isto o único
          jeito de corrigir era fechar o diálogo, achar o documento na lista e abrir o painel
          de detalhe pra cada arquivo. Título aqui já alimenta a Lista Mestre sozinho. Só pra
          quem pode editar metadados, e só faz sentido em pacote (pasta não usa Lista Mestre). */}
      {!enviando && !usaPastas && dados.podeEditarMetadados && progresso && progresso.some((l) => l.status === "ok" && l.documentoId) && (
        <div className="space-y-2 rounded-sm border bg-background/60 p-2">
          <p className="text-xs font-medium text-muted-foreground">Reconhecido no envio — corrija ou complete se precisar</p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {progresso.map((linha, indice) =>
              linha.status === "ok" && linha.documentoId ? (
                <div key={indice} className="space-y-1 rounded-sm border p-1.5">
                  <span className="block min-w-0 truncate text-xs text-muted-foreground" title={linha.nome}>{linha.nome}</span>
                  <div className="grid grid-cols-[1fr_9rem_9rem] items-center gap-2">
                    <Input
                      value={linha.titulo ?? ""}
                      placeholder="Título da prancha (Lista Mestre)"
                      className="h-8 text-xs"
                      disabled={salvandoMetadado === indice}
                      onChange={(event) => atualizarLinha(indice, { titulo: event.target.value || undefined })}
                      onBlur={(event) => salvarTituloPosEnvio(indice, event.target.value)}
                    />
                    <Select
                      value={linha.faseId ?? "__none"}
                      onValueChange={(v) => salvarMetadadoPosEnvio(indice, "faseId", v ?? "__none")}
                      disabled={salvandoMetadado === indice}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Fase —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— nenhuma</SelectItem>
                        {dados.fases.map((fase) => (
                          <SelectItem key={fase.id} value={fase.id}>{fase.sigla} · {fase.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={linha.tipoId ?? "__none"}
                      onValueChange={(v) => salvarMetadadoPosEnvio(indice, "tipoId", v ?? "__none")}
                      disabled={salvandoMetadado === indice}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Tipo —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— nenhum</SelectItem>
                        {dados.tipos.map((tipo) => (
                          <SelectItem key={tipo.id} value={tipo.id}>{tipo.sigla} · {tipo.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {usaPastas ? (
          <>Envie arquivos soltos ou uma pasta inteira (ou arraste aqui) para a pasta escolhida. Limite por arquivo: {TAMANHO_MAX_LABEL}.</>
        ) : (
          <>
            Envie arquivos soltos ou uma pasta inteira (ou arraste aqui). Vai para a disciplina escolhida. Limite por arquivo: {TAMANHO_MAX_BACKUP_LABEL} em Backup do modelo, {TAMANHO_MAX_LABEL} nos demais.
            {" Nomes fora do padrão em Pranchas aparecem marcados na revisão — não impede o envio."}
            {dados.nomenclatura.exigirFase && " A fase de cada documento é obrigatória e pode ser revista antes do envio."}
          </>
        )}
      </p>
    </div>
  );
}

function RevisarNomesDialog({
  itens,
  exigirFase,
  fases,
  tipos,
  dadosCorrecao,
  padrao,
  onCancel,
  onChange,
  onConfirm,
}: {
  itens: ItemEnvio[] | null;
  exigirFase: boolean;
  fases: FaseUpload[];
  tipos: FaseUpload[];
  dadosCorrecao: DadosCorrecaoNomeUpload | null;
  padrao: string | null;
  onCancel: () => void;
  onChange: (itens: ItemEnvio[]) => void;
  onConfirm: () => void;
}) {
  const foraDoPadraoCount = itens?.filter((item) => item.fora).length ?? 0;

  function alterar(indice: number, patch: Partial<ItemEnvio>) {
    if (!itens) return;
    onChange(itens.map((item, i) => (i === indice ? { ...item, ...patch } : item)));
  }

  function atualizarNome(indice: number, nome: string) {
    alterar(indice, { nome });
  }

  function atualizarFase(indice: number, faseId: string | null) {
    alterar(indice, { faseId: faseId || undefined });
  }

  function atualizarTipo(indice: number, tipoId: string | null) {
    alterar(indice, { tipoId: tipoId || undefined });
  }

  /**
   * Aplica uma sugestão do motor. Cada uma some depois de aplicada: renumerar troca o nome
   * (e o arquivo deixa de estar "fora do padrão" se o padrão passar a casar), backup muda o
   * pacote de destino, e "nova versão de" amarra o envio ao documento escolhido.
   */
  function aplicarSugestao(indice: number, sugestao: Sugestao) {
    const item = itens?.[indice];
    if (!item) return;
    const semEsta = item.sugestoes.filter((s) => s !== sugestao);
    if (sugestao.tipo === "renumerar") {
      alterar(indice, { nome: sugestao.nome, fora: foraDoPadrao(sugestao.nome, padrao), sugestoes: semEsta });
    } else if (sugestao.tipo === "enviar_backup") {
      // Backup não é prancha: o alerta de nomenclatura do pacote A deixa de valer.
      alterar(indice, { alvo: "B", fora: false, sugestoes: semEsta });
    } else {
      alterar(indice, { versaoDeDocumentoId: sugestao.documentoId, sugestoes: semEsta });
    }
  }

  function remover(indice: number) {
    if (!itens) return;
    const proxima = itens.filter((_, i) => i !== indice);
    if (proxima.length === 0) onCancel();
    else onChange(proxima);
  }

  return (
    <Dialog open={!!itens} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Revisar envio</DialogTitle>
          <DialogDescription>
            Fase e tipo vêm lidos do nome do arquivo e podem ser alterados.
            {foraDoPadraoCount > 0 && ` ${foraDoPadraoCount} arquivo(s) de Pranchas estão fora do padrão — renomeie, remova ou envie assim.`}
            {foraDoPadraoCount > 0 && (
              <span className="mt-1 block font-mono text-[11px]">
                Padrão: {padrao?.trim() || "{proj}-{disc}-{fase}-{nº}-{tipo}[-Rnn]"}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {itens?.map((item, indice) => {
            const { extensao } = separarExtensao(item.file.name);
            const nomeBase = item.nome.endsWith(extensao) ? item.nome.slice(0, item.nome.length - extensao.length) : item.nome;
            return (
              <div key={`${item.file.name}-${indice}`} className="flex items-start gap-2 rounded-md border p-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={item.file.name}>
                      {item.file.name}
                    </span>
                    {item.fora && (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="size-3" /> fora do padrão
                      </span>
                    )}
                  </div>
                  {item.fora && (
                    <div className="flex items-center gap-1">
                      <Input
                        value={nomeBase}
                        className="flex-1 font-mono text-xs"
                        onChange={(event) => atualizarNome(indice, event.target.value + extensao)}
                      />
                      {extensao && <span className="shrink-0 rounded-md border bg-muted px-1.5 py-1 font-mono text-xs text-muted-foreground">{extensao}</span>}
                    </div>
                  )}
                  {item.fora && dadosCorrecao && (
                    <CorrecaoNomeUpload
                      nomeOriginal={item.file.name}
                      faseId={item.faseId}
                      dados={dadosCorrecao}
                      onFaseChange={(faseId) => atualizarFase(indice, faseId)}
                      onAplicar={(nome) => atualizarNome(indice, nome)}
                    />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Fase{exigirFase ? "" : " (opcional)"}</Label>
                      <Select value={item.faseId ?? ""} onValueChange={(value) => atualizarFase(indice, value)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {fases.map((fase) => (
                            <SelectItem key={fase.id} value={fase.id}>{fase.sigla} · {fase.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {exigirFase && fases.length === 0 && (
                        <p className="text-xs text-destructive">Cadastre uma fase ativa para este projeto antes de enviar.</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo (opcional)</Label>
                      <Select value={item.tipoId ?? ""} onValueChange={(value) => atualizarTipo(indice, value)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {tipos.map((tipo) => (
                            <SelectItem key={tipo.id} value={tipo.id}>{tipo.sigla} · {tipo.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {item.versaoDeDocumentoId && (
                    <p className="text-xs text-primary">
                      Vai entrar como nova versão de um documento já existente.{" "}
                      <button
                        type="button"
                        className="underline hover:no-underline"
                        onClick={() => alterar(indice, { versaoDeDocumentoId: undefined })}
                      >
                        desfazer
                      </button>
                    </p>
                  )}

                  {item.avisos.length > 0 && (
                    <ul className="space-y-0.5">
                      {item.avisos.map((aviso) => (
                        <li key={aviso.tipo} className="flex items-start gap-1 text-[11px] text-muted-foreground">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
                          <span>{aviso.texto}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {item.sugestoes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.sugestoes.map((sugestao) => (
                        <Button
                          key={sugestao.tipo === "nova_versao_de" ? `nv-${sugestao.documentoId}` : sugestao.tipo}
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => aplicarSugestao(indice, sugestao)}
                        >
                          {sugestao.texto}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remover ${item.file.name} do envio`}
                  title="Remover deste envio"
                  onClick={() => remover(indice)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={!itens || itens.length === 0 || (exigirFase && itens.some((item) => !item.faseId))}>
            Enviar {itens?.length ?? 0} arquivo(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function separarExtensao(nome: string) {
  const indice = nome.lastIndexOf(".");
  return indice > 0 ? { base: nome.slice(0, indice), extensao: nome.slice(indice) } : { base: nome, extensao: "" };
}
