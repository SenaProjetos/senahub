"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FolderOpen, Trash2, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { foraDoPadrao, parsePranchaFilename } from "@/modules/projetos/pranchas/codigo";
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

type PacoteEnvio = "A" | "B";
type FaseUpload = { id: string; sigla: string; nome: string };
type ItemEnvio = { file: File; nome: string; alvo: PacoteEnvio; pastaId?: string; faseId?: string; fora: boolean };
type LinhaEnvioComArquivo = ItemEnvio & LinhaEnvio & {
  grupoRevisao?: string;
  revisaoAgrupadaId?: string;
};

export type DadosEnviarDocumentos = {
  disciplinas: { id: string; nome: string; sigla: string | null; usaPastas: boolean; pastas: PastaFlat[] }[];
  nomenclatura: { exigir: boolean; exigirFase: boolean; padrao: string | null };
  existentesPorDisciplina: Record<string, ArquivoExistente[]>;
  fases: FaseUpload[];
  tipos: FaseUpload[];
  codigoProjeto: string;
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
    for (const file of files) {
      if (file.size > limite) {
        toast.error(`${file.name}: excede o limite de ${limiteLabelDoPacote(usaPastas ? "" : pacote)}.`);
        continue;
      }
      itens.push({
        file,
        nome: file.name,
        alvo: pacote,
        ...(usaPastas ? { pastaId } : {}),
        ...(dados.nomenclatura.exigirFase ? { faseId: faseDoNome(file.name, dados.fases) } : {}),
        fora: !usaPastas && dados.nomenclatura.exigir && pacote === "A" && foraDoPadrao(file.name, dados.nomenclatura.padrao),
      });
    }
    if (itens.length === 0) return;

    if (itens.some((item) => item.fora) || dados.nomenclatura.exigirFase) {
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

  function atualizarLinha(indice: number, patch: Partial<LinhaEnvio>) {
    setProgresso((atual) => {
      if (!atual) return atual;
      return atual.map((linha, i) => (i === indice ? { ...linha, ...patch } : linha));
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

      <p className="text-xs text-muted-foreground">
        {usaPastas ? (
          <>Envie arquivos soltos ou uma pasta inteira (ou arraste aqui) para a pasta escolhida. Limite por arquivo: {TAMANHO_MAX_LABEL}.</>
        ) : (
          <>
            Envie arquivos soltos ou uma pasta inteira (ou arraste aqui). Vai para a disciplina escolhida. Limite por arquivo: {TAMANHO_MAX_BACKUP_LABEL} em Backup do modelo, {TAMANHO_MAX_LABEL} nos demais.
            {dados.nomenclatura.exigir && " Nomes fora do padrão em Pranchas pedem revisão antes do envio."}
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
  dadosCorrecao,
  padrao,
  onCancel,
  onChange,
  onConfirm,
}: {
  itens: ItemEnvio[] | null;
  exigirFase: boolean;
  fases: FaseUpload[];
  dadosCorrecao: DadosCorrecaoNomeUpload | null;
  padrao: string | null;
  onCancel: () => void;
  onChange: (itens: ItemEnvio[]) => void;
  onConfirm: () => void;
}) {
  const foraDoPadraoCount = itens?.filter((item) => item.fora).length ?? 0;

  function atualizarNome(indice: number, nome: string) {
    if (!itens) return;
    onChange(itens.map((item, i) => (i === indice ? { ...item, nome } : item)));
  }

  function atualizarFase(indice: number, faseId: string | null) {
    if (!itens) return;
    onChange(itens.map((item, i) => (i === indice ? { ...item, faseId: faseId || undefined } : item)));
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
            {exigirFase
              ? "Confirme a fase de cada documento antes de enviar. A sugestão vem do nome do arquivo e pode ser alterada."
              : `${foraDoPadraoCount} arquivo(s) de Pranchas fora do padrão. Renomeie, remova ou envie assim.`}
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
                  {exigirFase && (
                    <div className="space-y-1">
                      <Label className="text-xs">Fase</Label>
                      <Select value={item.faseId ?? ""} onValueChange={(value) => atualizarFase(indice, value)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione a fase…" />
                        </SelectTrigger>
                        <SelectContent>
                          {fases.map((fase) => (
                            <SelectItem key={fase.id} value={fase.id}>{fase.sigla} · {fase.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fases.length === 0 && <p className="text-xs text-destructive">Cadastre uma fase ativa para este projeto antes de enviar.</p>}
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

function faseDoNome(nome: string, fases: FaseUpload[]): string | undefined {
  const sigla = parsePranchaFilename(nome)?.fase;
  return sigla ? fases.find((fase) => fase.sigla.toUpperCase() === sigla)?.id : undefined;
}

function separarExtensao(nome: string) {
  const indice = nome.lastIndexOf(".");
  return indice > 0 ? { base: nome.slice(0, indice), extensao: nome.slice(indice) } : { base: nome, extensao: "" };
}
