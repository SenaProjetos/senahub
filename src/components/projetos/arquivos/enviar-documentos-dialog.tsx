"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, FolderOpen, Trash2, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { foraDoPadrao } from "@/modules/projetos/pranchas/codigo";
import type { PastaFlat } from "@/modules/projetos/pastas/arvore";
import { TAMANHO_MAX_BACKUP_LABEL, TAMANHO_MAX_LABEL, limiteDoPacote, limiteLabelDoPacote } from "@/modules/uploads/limites";
import { detectarNovasRevisoes, mensagemNovasRevisoes, type ArquivoExistente } from "@/modules/uploads/revisao-nova";
import { gruposRevisaoAgrupada } from "@/modules/uploads/revisao-agrupada";
import { enviarArquivoComProgresso, ErroEnvio, PainelProgressoEnvio, type LinhaEnvio, type ResultadoUpload } from "@/components/projetos/upload-progresso";
import { lerTextoPdf } from "@/lib/ler-texto-pdf";
import { extrairTituloDoCarimbo } from "@/modules/uploads/titulo-carimbo";
import { decidirTitulo, usaTituloPadrao, type OrigemTitulo, type TituloRegistrado } from "@/modules/uploads/titulo-sugerido";
import { SeletorPasta } from "@/components/projetos/pasta-tree-view";
import { Button } from "@/components/ui/button";
import { CorrecaoNomeUpload, type DadosCorrecaoNomeUpload } from "@/components/projetos/arquivos/correcao-nome-upload";
import { Checkbox } from "@/components/ui/checkbox";
import { nomeCorrigidoPeloPadrao } from "@/modules/uploads/nome-corrigido";
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
import { resolverDestino } from "@/modules/uploads/nomenclatura/destino";
import {
  opcoesNaVersao,
  siglaDoCardNaVersao,
  siglaNoLugarDaDisciplina,
  subsDoCard,
} from "@/modules/uploads/nomenclatura/siglas-nome";
import { montarVocabulario, type CatalogosNomenclatura } from "@/modules/uploads/nomenclatura/vocabulario";
import type { ExtensaoDef } from "@/modules/uploads/nomenclatura/extensoes";
import { editarMetadadosDocumento } from "@/modules/uploads/actions";

type PacoteEnvio = "A" | "B";
type FaseUpload = { id: string; sigla: string; nome: string };

/** Acima disto não vale abrir o PDF só pra ler o carimbo (mesmo teto de `tamanho-papel-pdf.ts`). */
const LIMITE_LEITURA_CARIMBO_BYTES = 60 * 1024 * 1024;
type ItemEnvio = {
  file: File;
  nome: string;
  /** Disciplina resolvida (pela sigla no nome ou pela faixa de numeração) ou escolhida aqui
   *  quando o motor não deu conta sozinho. `undefined` enquanto `precisaDisciplina` for true. */
  disciplinaId?: string;
  alvo: PacoteEnvio;
  pastaId?: string;
  /** Disciplina não resolvida pelo motor (sem sigla no nome e sem faixa cadastrada que bata) —
   *  a tela de revisão pede pra escolher, arquivo por arquivo, em vez de travar o envio inteiro. */
  precisaDisciplina?: boolean;
  /** Disciplina já resolvida, mas ela usa árvore de pastas — falta só a pasta (não dá pra
   *  automatizar isso, pedido do dono: "perguntar só a pasta" nesse caso). */
  precisaPasta?: boolean;
  faseId?: string;
  /** Tipo de documento lido do nome (alta confiança) ou escolhido aqui. */
  tipoId?: string;
  /** Sub-disciplina lida do nome (padrão v2), só quando é do card da disciplina resolvida. */
  subdisciplinaId?: string;
  /** "Nova versão de": documento existente que recebe esta revisão, mesmo com outro nome. */
  versaoDeDocumentoId?: string;
  fora: boolean;
  /** Avisos e sugestões do motor de nomenclatura, para a etapa de revisão. */
  avisos: Aviso[];
  sugestoes: Sugestao[];
};
/** Um documento na conferência pós-envio — PDF e DWG da mesma prancha viram UMA linha. */
type DocumentoConferencia = {
  documentoId: string;
  arquivos: string[];
  faseId?: string;
  tipoId?: string;
  /** Título da prancha pra Lista Mestre — preenchido aqui já alimenta a Lista Mestre sozinha. */
  titulo?: string;
  /** Título lido do carimbo e ainda não conferido mostra o selo "confira". */
  origemTitulo?: OrigemTitulo;
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
  nomenclatura: {
    exigir: boolean;
    exigirFase: boolean;
    padrao: string | null;
    /** Outras versões do padrão, para o aviso "parece seguir a vN" (D6). */
    outrosPadroes?: { rotulo: string; padrao: string }[];
    /** Dígitos do número da folha na versão do projeto (v1 = 4, v2 = 3). */
    larguraNumero?: number;
  };
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
export function EnviarDocumentosDialog({
  dados,
  abrirAoCarregar = false,
}: {
  dados: DadosEnviarDocumentos;
  /**
   * Chegou pelo atalho "Enviar arquivos" do card da disciplina (`?enviar=1`). O card não tem
   * uploader próprio — ele só traz a pessoa pra cá, pro MESMO fluxo de envio, já aberto.
   */
  abrirAoCarregar?: boolean;
}) {
  const [aberto, setAberto] = useState(abrirAoCarregar);
  const [enviando, setEnviando] = useState(false);

  // Tira o `enviar=1` da URL assim que o diálogo abre: sem isso, recarregar a página (ou voltar
  // pra ela pelo histórico) reabriria o envio sozinho, sem ninguém ter pedido. `replaceState`
  // nativo (o App Router sincroniza) em vez de `router.replace`: não refaz a página inteira no
  // servidor só pra sumir com um parâmetro, e checar antes deixa o efeito idempotente.
  useEffect(() => {
    if (!abrirAoCarregar) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("enviar")) return;
    url.searchParams.delete("enviar");
    window.history.replaceState(window.history.state, "", url);
  }, [abrirAoCarregar]);

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
            Selecione ou arraste os arquivos — disciplina e destino são reconhecidos pelo nome, e
            só pergunta o que o nome não disser. Depois do envio, você confere os dados de cada
            documento.
          </DialogDescription>
        </DialogHeader>
        <UploaderDocumentos dados={dados} onEnviarChange={setEnviando} onConcluir={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}

function UploaderDocumentos({
  dados,
  onEnviarChange,
  onConcluir,
}: {
  dados: DadosEnviarDocumentos;
  onEnviarChange: (enviando: boolean) => void;
  onConcluir: () => void;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [pendentes, setPendentes] = useState<ItemEnvio[] | null>(null);
  const [progresso, setProgresso] = useState<LinhaEnvioComArquivo[] | null>(null);
  const inputArquivos = useRef<HTMLInputElement>(null);
  const inputPasta = useRef<HTMLInputElement>(null);

  // Vocabulário do projeto (siglas + sinônimos dos catálogos), montado uma vez por diálogo.
  // O escopo é o projeto — o MESMO que a rota usa. Passar `null` aqui descartaria as siglas
  // próprias do projeto e a tela mostraria "—" num campo que o servidor preencheria.
  const vocabulario = useMemo(
    () => montarVocabulario(dados.catalogosNomenclatura, dados.projeto.id),
    [dados.catalogosNomenclatura, dados.projeto.id],
  );
  // O que a correção de nome escreve sai na escrita DA VERSÃO do padrão do projeto (BAS na v2,
  // BS na v1) — as siglas de `dados.fases`/`dados.disciplinas` são as das colunas antigas (v1).
  const paraCorrecao = useMemo(
    () => ({
      fases: opcoesNaVersao(dados.fases, vocabulario, "fase"),
      tipos: opcoesNaVersao(dados.tipos, vocabulario, "tipo"),
      disciplinas: dados.disciplinas.map((d) => ({
        ...d,
        sigla: siglaDoCardNaVersao(d, dados.catalogosNomenclatura, vocabulario),
        subdisciplinas: subsDoCard(d.catalogoId, dados.catalogosNomenclatura),
      })),
    }),
    [dados.fases, dados.tipos, dados.disciplinas, dados.catalogosNomenclatura, vocabulario],
  );
  /** Sub lida com confiança e do MESMO card da disciplina (D9) — senão, nada. */
  function subDaLeitura(leitura: ReturnType<typeof interpretarNomeArquivo>, catalogoId: string | null) {
    return confiavel(leitura.subdisciplina) && catalogoId && vocabulario.paiDe(leitura.subdisciplina.valor) === catalogoId
      ? leitura.subdisciplina.valor
      : undefined;
  }
  // Disciplina lida do nome (sigla ou faixa de numeração) → linha do PROJETO (`Disciplina`,
  // não `DisciplinaCatalogo`) — só entre as que o usuário pode enviar (mesmo filtro de sempre).
  const catalogoParaDisciplina = useMemo(
    () => new Map(dados.disciplinas.filter((d) => d.catalogoId).map((d) => [d.catalogoId as string, d])),
    [dados.disciplinas],
  );
  const { arrastando, dropProps } = useDropzone((files) => prepararEnvio(files), enviando);

  /**
   * Lê o nome duas vezes quando a disciplina resolve: a 1ª (sem disciplina nenhuma) só serve
   * pra achar QUAL disciplina é; a 2ª já leva o catálogo certo (sinônimos do projeto, "nova
   * versão de" com os documentos daquele destino) — a mesma qualidade que o fluxo manual de
   * antes tinha. Sem a 2ª passada, sugestões que dependem de saber a disciplina (nova versão,
   * fase/tipo por sinônimo do projeto) ficariam piores só porque agora a disciplina é automática.
   */
  function montarItem(file: File): ItemEnvio {
    const leituraInicial = interpretarNomeArquivo(file.name, {
      projeto: dados.projeto,
      disciplinaCatalogoId: null,
      padrao: dados.nomenclatura.padrao,
      outrosPadroes: dados.nomenclatura.outrosPadroes,
      vocabulario,
      extensoes: dados.extensoesNomenclatura,
    });
    const disciplinaResolvida = confiavel(leituraInicial.disciplina)
      ? catalogoParaDisciplina.get(leituraInicial.disciplina.valor)
      : undefined;

    if (!disciplinaResolvida) {
      return {
        file,
        nome: file.name,
        alvo: "A",
        precisaDisciplina: true,
        ...(confiavel(leituraInicial.fase) ? { faseId: leituraInicial.fase.valor } : {}),
        ...(confiavel(leituraInicial.tipo) ? { tipoId: leituraInicial.tipo.valor } : {}),
        fora: false,
        avisos: leituraInicial.avisos,
        sugestoes: leituraInicial.sugestoes,
      };
    }

    if (disciplinaResolvida.usaPastas) {
      // Árvore de pastas não dá pra automatizar (não existe "número da pasta" no nome) — a
      // disciplina já resolveu sozinha, só falta perguntar a pasta (decisão do dono).
      return {
        file,
        nome: file.name,
        disciplinaId: disciplinaResolvida.id,
        alvo: "A",
        precisaPasta: true,
        ...(confiavel(leituraInicial.fase) ? { faseId: leituraInicial.fase.valor } : {}),
        ...(confiavel(leituraInicial.tipo) ? { tipoId: leituraInicial.tipo.valor } : {}),
        fora: false,
        avisos: leituraInicial.avisos,
        sugestoes: leituraInicial.sugestoes,
      };
    }

    const alvo: PacoteEnvio = resolverDestino(leituraInicial) === "backup" ? "B" : "A";
    const documentosDoDestino = (dados.documentosPorDisciplina[disciplinaResolvida.id] ?? []).filter(
      (documento) => documento.local === alvo,
    );
    const leituraFinal = interpretarNomeArquivo(file.name, {
      projeto: dados.projeto,
      disciplinaCatalogoId: disciplinaResolvida.catalogoId,
      padrao: dados.nomenclatura.padrao,
      outrosPadroes: dados.nomenclatura.outrosPadroes,
      vocabulario,
      extensoes: dados.extensoesNomenclatura,
      documentosExistentes: documentosDoDestino,
    });
    return {
      file,
      nome: file.name,
      disciplinaId: disciplinaResolvida.id,
      alvo,
      ...(confiavel(leituraFinal.fase) ? { faseId: leituraFinal.fase.valor } : {}),
      ...(confiavel(leituraFinal.tipo) ? { tipoId: leituraFinal.tipo.valor } : {}),
      subdisciplinaId: subDaLeitura(leituraFinal, disciplinaResolvida.catalogoId),
      // Feedback de padrão sempre visível — `exigir` fica reservado pro dia em que virar
      // bloqueio de verdade; até lá, a equipe já vê e vai se adaptando (pedido do dono).
      fora: alvo === "A" && foraDoPadrao(file.name, dados.nomenclatura.padrao),
      avisos: leituraFinal.avisos,
      sugestoes: leituraFinal.sugestoes,
    };
  }

  /**
   * Título sugerido pelo carimbo do PDF (pedido do dono: "se vier pré-pronto, o usuário só
   * confere e aprova"). Nunca lança e nunca trava o envio — PDF sem camada de texto, corrompido,
   * grande demais ou de carimbo desconhecido simplesmente não gera sugestão.
   */
  async function lerTituloDoCarimbo(file: File): Promise<string | null> {
    if (!/\.pdf$/i.test(file.name) || file.size > LIMITE_LEITURA_CARIMBO_BYTES) return null;
    try {
      const { itens } = await lerTextoPdf(file);
      return extrairTituloDoCarimbo(itens);
    } catch {
      return null;
    }
  }

  function prepararEnvio(lista: FileList | File[] | null) {
    const files = lista ? Array.from(lista) : [];
    if (files.length === 0) return;

    const itens: ItemEnvio[] = [];
    for (const file of files) {
      const item = montarItem(file);
      // Limite só dá pra checar quando o destino (pacote) já está resolvido — arquivo que
      // precisa de disciplina/pasta manual passa direto; o limite entra quando o usuário
      // completar a escolha na revisão.
      if (!item.precisaDisciplina) {
        const limite = limiteDoPacote(item.precisaPasta ? "" : item.alvo);
        if (file.size > limite) {
          toast.error(`${file.name}: excede o limite de ${limiteLabelDoPacote(item.precisaPasta ? "" : item.alvo)}.`);
          continue;
        }
      }
      itens.push(item);
    }
    if (itens.length === 0) return;

    // Revisar antes de enviar sempre que houver o que decidir: disciplina/pasta não resolvida
    // sozinha, nome fora do padrão, fase obrigatória, ou qualquer aviso/sugestão do motor.
    const temOQueRevisar = itens.some(
      (item) => item.precisaDisciplina || item.precisaPasta || item.fora || item.avisos.length > 0 || item.sugestoes.length > 0,
    );
    if (temOQueRevisar || dados.nomenclatura.exigirFase) {
      setPendentes(itens);
      return;
    }
    void enviar(itens);
  }

  /** Usuário escolheu a disciplina de um item que o motor não resolveu sozinho — refaz a
   *  leitura com o catálogo certo (mesma lógica de `montarItem`, mas com a disciplina dada,
   *  não descoberta). */
  function escolherDisciplina(indiceEmPendentes: number, disciplinaId: string) {
    if (!pendentes) return;
    const disciplinaEscolhida = dados.disciplinas.find((d) => d.id === disciplinaId);
    if (!disciplinaEscolhida) return;
    const file = pendentes[indiceEmPendentes].file;

    if (disciplinaEscolhida.usaPastas) {
      // Escolha manual pula o gate de tamanho de `prepararEnvio` (que só roda ANTES de saber
      // a disciplina) — sem checar aqui, um arquivo grande demais passava direto pro envio e
      // só falhava na rota, sem aviso nenhum na tela.
      if (file.size > limiteDoPacote("")) {
        toast.error(`${file.name}: excede o limite de ${limiteLabelDoPacote("")}.`);
        setPendentes(pendentes.filter((_, i) => i !== indiceEmPendentes));
        return;
      }
      setPendentes(pendentes.map((item, i) => (i === indiceEmPendentes
        // `pastaId` explícito undefined: se o item já tinha pasta de uma disciplina anterior
        // (usuário trocou a escolha), a pasta velha pertence a OUTRA árvore e não pode ficar.
        ? { ...item, disciplinaId, pastaId: undefined, precisaDisciplina: false, precisaPasta: true }
        : item)));
      return;
    }

    const leituraInicial = interpretarNomeArquivo(file.name, {
      projeto: dados.projeto,
      disciplinaCatalogoId: null,
      padrao: dados.nomenclatura.padrao,
      outrosPadroes: dados.nomenclatura.outrosPadroes,
      vocabulario,
      extensoes: dados.extensoesNomenclatura,
    });
    const alvo: PacoteEnvio = resolverDestino(leituraInicial) === "backup" ? "B" : "A";
    if (file.size > limiteDoPacote(alvo)) {
      toast.error(`${file.name}: excede o limite de ${limiteLabelDoPacote(alvo)}.`);
      setPendentes(pendentes.filter((_, i) => i !== indiceEmPendentes));
      return;
    }
    const documentosDoDestino = (dados.documentosPorDisciplina[disciplinaId] ?? []).filter(
      (documento) => documento.local === alvo,
    );
    const leituraFinal = interpretarNomeArquivo(file.name, {
      projeto: dados.projeto,
      disciplinaCatalogoId: disciplinaEscolhida.catalogoId,
      padrao: dados.nomenclatura.padrao,
      outrosPadroes: dados.nomenclatura.outrosPadroes,
      vocabulario,
      extensoes: dados.extensoesNomenclatura,
      documentosExistentes: documentosDoDestino,
    });
    setPendentes(pendentes.map((item, i) => (i === indiceEmPendentes
      ? {
          ...item,
          disciplinaId,
          alvo,
          // Idem: pasta de uma disciplina anterior não vale mais depois da troca pra pacote.
          pastaId: undefined,
          precisaDisciplina: false,
          precisaPasta: false,
          ...(confiavel(leituraFinal.fase) ? { faseId: leituraFinal.fase.valor } : {}),
          ...(confiavel(leituraFinal.tipo) ? { tipoId: leituraFinal.tipo.valor } : {}),
          subdisciplinaId: subDaLeitura(leituraFinal, disciplinaEscolhida.catalogoId),
          fora: alvo === "A" && foraDoPadrao(file.name, dados.nomenclatura.padrao),
          avisos: leituraFinal.avisos,
          sugestoes: leituraFinal.sugestoes,
        }
      : item)));
  }

  function escolherPasta(indiceEmPendentes: number, pastaId: string) {
    if (!pendentes) return;
    setPendentes(pendentes.map((item, i) => (i === indiceEmPendentes ? { ...item, pastaId, precisaPasta: false } : item)));
  }

  /** Corrige o destino (Pranchas/Backup) de um item já com disciplina resolvida — o motor
   *  decide sozinho pela extensão/nome, mas nem sempre é o que a pessoa quer (ex.: um .pdf
   *  que é backup mas não tem pista nenhuma de backup no nome nem extensão marcada). */
  function alterarAlvo(indiceEmPendentes: number, alvo: PacoteEnvio) {
    if (!pendentes) return;
    const item = pendentes[indiceEmPendentes];
    if (!item.disciplinaId) return;
    if (item.file.size > limiteDoPacote(alvo)) {
      toast.error(`${item.file.name}: excede o limite de ${limiteLabelDoPacote(alvo)}.`);
      return;
    }
    const disciplinaCatalogoId = dados.disciplinas.find((d) => d.id === item.disciplinaId)?.catalogoId ?? null;
    const documentosDoDestino = (dados.documentosPorDisciplina[item.disciplinaId] ?? []).filter(
      (documento) => documento.local === alvo,
    );
    const leitura = interpretarNomeArquivo(item.file.name, {
      projeto: dados.projeto,
      disciplinaCatalogoId,
      padrao: dados.nomenclatura.padrao,
      outrosPadroes: dados.nomenclatura.outrosPadroes,
      vocabulario,
      extensoes: dados.extensoesNomenclatura,
      documentosExistentes: documentosDoDestino,
    });
    setPendentes(pendentes.map((it, i) => (i === indiceEmPendentes
      ? {
          ...it,
          alvo,
          fora: alvo === "A" && foraDoPadrao(item.file.name, dados.nomenclatura.padrao),
          avisos: leitura.avisos,
          sugestoes: leitura.sugestoes,
        }
      : it)));
  }

  async function enviar(itens: ItemEnvio[]) {
    setPendentes(null);
    setConferencia([]); // lote novo, conferência nova

    // Leitura do carimbo começa JÁ, em paralelo, mas ninguém espera por ela aqui: cada arquivo
    // só aguarda a própria leitura na hora de subir (ver o laço adiante). Assim o painel de
    // progresso aparece na hora e a leitura acontece enquanto os uploads correm.
    const titulosDoCarimbo = itens.map((item) => lerTituloDoCarimbo(item.file));

    // Cada item tem sua PRÓPRIA disciplina/destino agora — "nova versão" precisa checar por
    // grupo (disciplina + pacote OU pasta), não mais um destino só pro lote inteiro.
    const gruposPorDestino = new Map<string, { nomes: string[]; disciplinaId: string; pastaId?: string; pacote?: string }>();
    for (const item of itens) {
      const chave = item.pastaId ? `${item.disciplinaId}::pasta:${item.pastaId}` : `${item.disciplinaId}::pacote:${item.alvo}`;
      const grupo = gruposPorDestino.get(chave) ?? {
        nomes: [],
        disciplinaId: item.disciplinaId as string,
        pastaId: item.pastaId,
        pacote: item.pastaId ? undefined : item.alvo,
      };
      grupo.nomes.push(item.nome);
      gruposPorDestino.set(chave, grupo);
    }
    const revisoes = [...gruposPorDestino.values()].flatMap((grupo) =>
      detectarNovasRevisoes(
        grupo.nomes,
        dados.existentesPorDisciplina[grupo.disciplinaId] ?? [],
        grupo.pastaId ? { pastaId: grupo.pastaId } : { pacote: grupo.pacote },
      ),
    );
    if (revisoes.length > 0) toast.info(mensagemNovasRevisoes(revisoes), { duration: 6000 });

    const grupos = gruposRevisaoAgrupada(itens.map((item) => ({
      nome: item.nome,
      pacote: item.pastaId ? null : item.alvo,
      pastaId: item.pastaId ?? null,
      disciplinaId: item.disciplinaId as string,
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
        // Espera só a leitura DESTE arquivo (disparada lá em cima). De propósito NÃO escreve o
        // título na linha agora: só depois da resposta do servidor dá pra saber se o documento
        // já tinha título (que vence a sugestão). Pintar antes deixaria na tela, durante o
        // upload, um valor diferente do que está no banco — e um blur no meio disso gravaria a
        // sugestão por cima do título existente.
        const tituloDoCarimbo = await titulosDoCarimbo[i];
        try {
          const revisaoDoGrupo = grupo ? revisoesPorGrupo.get(grupo) : undefined;
          const resultado = await enviarArquivoComProgresso(
            linhas[i].file,
            {
              nome: linhas[i].nome,
              disciplinaId: linhas[i].disciplinaId as string,
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
            registrarConferencia(linhas[i], resultado, tituloDoCarimbo);
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

  // ── Conferência pós-envio (etapa 3) ─────────────────────────────────────────────────────
  // Uma linha por DOCUMENTO, não por arquivo: PDF e DWG da mesma prancha caem no mesmo
  // `documentoId` e têm os mesmos metadados — duas linhas mostravam o título num e o campo
  // vazio no outro, sendo o mesmo registro. Corrigir aqui evita fechar o diálogo, achar o
  // documento na lista e abrir o painel de detalhe de cada um.
  const [conferencia, setConferencia] = useState<DocumentoConferencia[]>([]);
  const [salvandoDocumento, setSalvandoDocumento] = useState<string | null>(null);
  const [, iniciarSalvarMetadado] = useTransition();
  /** Nome do tipo (Configurações → Lista Mestre) = título padrão oferecido quando nada foi lido. */
  const nomePorTipoId = useMemo(() => new Map(dados.tipos.map((tipo) => [tipo.id, tipo.nome])), [dados.tipos]);

  /**
   * O que esta tela sabe do título de cada documento — fonte das decisões (síncrona, ao contrário
   * do estado). Por `documentoId`, não por índice: um novo lote no mesmo diálogo recomeça a
   * lista, e um registro por índice confundia o lote anterior com o atual.
   */
  const titulos = useRef(new Map<string, TituloRegistrado>());

  function atualizarDocumento(documentoId: string, patch: Partial<DocumentoConferencia>) {
    setConferencia((atual) => atual.map((doc) => (doc.documentoId === documentoId ? { ...doc, ...patch } : doc)));
  }

  function gravarTitulo(documentoId: string, registro: TituloRegistrado) {
    void editarMetadadosDocumento({ documentoId, titulo: registro.valor }).then((r) => {
      if (r.ok) return;
      if (titulos.current.get(documentoId) === registro) titulos.current.delete(documentoId); // o blur tenta de novo
      toast.error(`Não foi possível salvar o título sugerido: ${r.error}`);
    });
  }

  /**
   * Entra na conferência cada arquivo que o servidor aceitou. O título vem pronto quando dá
   * (pedido do dono: "o usuário só confere e aprova") e é GRAVADO já, porque o campo só salva
   * no blur e quem apenas olhasse veria a sugestão sem ela estar no banco. A precedência
   * (banco > carimbo > padrão do tipo) está em `decidirTitulo`, com o tipo CONFIRMADO pelo
   * servidor, não o lido localmente.
   */
  function registrarConferencia(
    linha: { nome: string; pastaId?: string },
    resultado: ResultadoUpload,
    tituloDoCarimbo: string | null,
  ) {
    const documentoId = resultado.documentoId;
    // Pasta não usa Lista Mestre; sem permissão, a action seria recusada.
    if (!documentoId || linha.pastaId || !dados.podeEditarMetadados) return;
    const { registro, gravar } = decidirTitulo({
      registrado: titulos.current.get(documentoId) ?? null,
      tituloAtual: resultado.tituloAtual ?? null,
      tituloDoCarimbo,
    });
    if (registro) titulos.current.set(documentoId, registro);
    if (registro && gravar) gravarTitulo(documentoId, registro);

    setConferencia((atual) => {
      const indice = atual.findIndex((doc) => doc.documentoId === documentoId);
      const base: DocumentoConferencia = indice >= 0 ? atual[indice] : { documentoId, arquivos: [] };
      const doc: DocumentoConferencia = {
        ...base,
        arquivos: base.arquivos.includes(linha.nome) ? base.arquivos : [...base.arquivos, linha.nome],
        faseId: resultado.faseId,
        tipoId: resultado.tipoId,
        titulo: registro?.valor ?? base.titulo,
        origemTitulo: registro?.origem,
      };
      return indice >= 0 ? atual.map((d, i) => (i === indice ? doc : d)) : [...atual, doc];
    });
  }

  function salvarTituloConferencia(documentoId: string, tituloDigitado: string) {
    const valor = tituloDigitado.trim();
    if (valor === (titulos.current.get(documentoId)?.valor ?? "")) return; // nada mudou — não bate a action à toa no blur
    atualizarDocumento(documentoId, { titulo: valor || undefined, origemTitulo: undefined }); // digitou: deixou de ser palpite
    setSalvandoDocumento(documentoId);
    iniciarSalvarMetadado(async () => {
      const r = await editarMetadadosDocumento({ documentoId, titulo: valor || null });
      setSalvandoDocumento(null);
      if (r.ok) titulos.current.set(documentoId, { valor, origem: "usuario" });
      else toast.error(r.error);
    });
  }

  function salvarMetadadoConferencia(documentoId: string, campo: "faseId" | "tipoId", valorBruto: string) {
    const doc = conferencia.find((d) => d.documentoId === documentoId);
    if (!doc) return;
    const anterior = doc[campo];
    const valor = valorBruto === "__none" ? "" : valorBruto;
    atualizarDocumento(documentoId, { [campo]: valor || undefined });
    setSalvandoDocumento(documentoId);
    iniciarSalvarMetadado(async () => {
      const r = await editarMetadadosDocumento(
        campo === "faseId" ? { documentoId, faseId: valor || null } : { documentoId, tipoId: valor || null },
      );
      setSalvandoDocumento(null);
      if (!r.ok) {
        toast.error(r.error);
        atualizarDocumento(documentoId, { [campo]: anterior }); // desfaz o otimista
        return;
      }
      // Título era o padrão do tipo antigo: acompanha o novo (ou sai, se o tipo foi removido).
      if (campo === "tipoId" && usaTituloPadrao(doc.titulo, anterior ? nomePorTipoId.get(anterior) : null)) {
        salvarTituloConferencia(documentoId, (valor && nomePorTipoId.get(valor)) || "");
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
              disciplinaId: linha.disciplinaId as string,
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
          registrarConferencia(linha, resultado, await lerTituloDoCarimbo(linha.file));
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

  const temConferencia = dados.podeEditarMetadados;
  const titulosAConferir = conferencia.filter((doc) => doc.origemTitulo === "carimbo").length;
  // 4 = além da última etapa: enviado, sem nada a conferir (sem permissão, ou só pastas).
  const etapa = enviando ? 2 : conferencia.length > 0 ? 3 : progresso && progresso.length > 0 ? 4 : 1;

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
        fases={paraCorrecao.fases}
        tipos={paraCorrecao.tipos}
        disciplinas={paraCorrecao.disciplinas}
        codigoProjeto={dados.codigoProjeto}
        padrao={dados.nomenclatura.padrao}
        larguraNumero={dados.nomenclatura.larguraNumero ?? 4}
        onCancel={() => setPendentes(null)}
        onChange={setPendentes}
        onEscolherDisciplina={escolherDisciplina}
        onEscolherPasta={escolherPasta}
        onAlterarAlvo={alterarAlvo}
        onConfirm={() => pendentes && void enviar(pendentes)}
      />

      <EtapasEnvio etapa={etapa} comConferencia={temConferencia} />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={enviando} onClick={() => inputArquivos.current?.click()}>
          <UploadIcon className="size-3.5" /> Arquivos
        </Button>
        <Button size="sm" variant="outline" disabled={enviando} onClick={() => inputPasta.current?.click()}>
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
          recolherAoConcluir={conferencia.length > 0}
        />
      )}

      {enviando && temConferencia && (
        <p className="text-xs text-muted-foreground">
          Ao terminar, você confere aqui o título, a fase e o tipo de cada documento.
        </p>
      )}

      {!enviando && conferencia.length > 0 && (
        <div className="space-y-2 rounded-sm border bg-background/60 p-2">
          <div className="px-1">
            <p className="text-xs font-medium">Confira os dados reconhecidos</p>
            <p className="text-[11px] text-muted-foreground">
              {conferencia.length} documento(s)
              {titulosAConferir > 0 && ` · ${titulosAConferir} título(s) sugerido(s) para conferir`}
              {" · as alterações são salvas na hora."}
            </p>
          </div>
          <div className="max-h-[45svh] space-y-2 overflow-y-auto">
            {conferencia.map((doc) => {
              const nomeDoTipo = doc.tipoId ? (nomePorTipoId.get(doc.tipoId) ?? null) : null;
              const usaPadrao = usaTituloPadrao(doc.titulo, nomeDoTipo);
              const salvando = salvandoDocumento === doc.documentoId;
              return (
                <div key={doc.documentoId} className="space-y-1 rounded-sm border p-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={doc.arquivos.join("\n")}>
                      {separarExtensao(doc.arquivos[0] ?? "").base}
                    </span>
                    {doc.arquivos.map((arquivo) => (
                      <span
                        key={arquivo}
                        className="shrink-0 rounded-sm border px-1 font-mono text-[10px] uppercase text-muted-foreground"
                      >
                        {separarExtensao(arquivo).extensao.replace(".", "") || "—"}
                      </span>
                    ))}
                    {doc.origemTitulo === "carimbo" && (
                      <span className="shrink-0 rounded-sm bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                        Título lido do carimbo — confira
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
                    <div className="min-w-0 space-y-1">
                      <Input
                        value={doc.titulo ?? ""}
                        placeholder={nomeDoTipo ?? "Título da prancha (Lista Mestre)"}
                        aria-label="Título da prancha"
                        className="h-8 min-w-0 text-xs"
                        disabled={salvando}
                        onChange={(event) => atualizarDocumento(doc.documentoId, { titulo: event.target.value || undefined })}
                        onBlur={(event) => salvarTituloConferencia(doc.documentoId, event.target.value)}
                      />
                      {/* Padrão = nome do tipo em Configurações → Lista Mestre. Só vira título com
                          confirmação: é genérico, e quem envia pode detalhar (trecho, pavimento…). */}
                      {nomeDoTipo && (!doc.titulo || usaPadrao) && (
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Checkbox
                            checked={usaPadrao}
                            disabled={salvando}
                            onCheckedChange={(marcado) =>
                              salvarTituloConferencia(doc.documentoId, marcado ? nomeDoTipo : "")
                            }
                          />
                          Usar o padrão “{nomeDoTipo}” como título
                        </label>
                      )}
                    </div>
                    <Select
                      value={doc.faseId ?? "__none"}
                      onValueChange={(v) => salvarMetadadoConferencia(doc.documentoId, "faseId", v ?? "__none")}
                      disabled={salvando}
                    >
                      <SelectTrigger className="h-8 w-full min-w-0 text-xs" aria-label="Fase">
                        <SelectValue placeholder="Fase —" className="min-w-0 overflow-hidden" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— nenhuma</SelectItem>
                        {dados.fases.map((fase) => (
                          <SelectItem key={fase.id} value={fase.id}>{fase.sigla} · {fase.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={doc.tipoId ?? "__none"}
                      onValueChange={(v) => salvarMetadadoConferencia(doc.documentoId, "tipoId", v ?? "__none")}
                      disabled={salvando}
                    >
                      <SelectTrigger className="h-8 w-full min-w-0 text-xs" aria-label="Tipo">
                        <SelectValue placeholder="Tipo —" className="min-w-0 overflow-hidden" />
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
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={onConcluir}>
              Concluir
            </Button>
          </div>
        </div>
      )}

      {etapa === 1 && (
        <p className="text-xs text-muted-foreground">
          Envie arquivos soltos ou uma pasta inteira (ou arraste aqui) — disciplina e destino são
          reconhecidos pelo nome do arquivo (fase, tipo e número da prancha, ou a faixa de
          numeração cadastrada). Só pergunta disciplina/pasta quando o nome não resolve sozinho.
          Limite por arquivo: {TAMANHO_MAX_BACKUP_LABEL} em Backup do modelo, {TAMANHO_MAX_LABEL} nos demais.
          {" Nomes fora do padrão em Pranchas aparecem marcados na revisão — não impede o envio."}
          {dados.nomenclatura.exigirFase && " A fase de cada documento é obrigatória e pode ser revista antes do envio."}
        </p>
      )}
    </div>
  );
}

/**
 * Onde a pessoa está no envio. Derivado do estado que já existe — a revisão de nomes é um
 * diálogo à parte e só abre quando precisa, por isso conta como parte de "Escolher".
 * `etapa` além da última = tudo feito (enviado sem nada a conferir).
 */
function EtapasEnvio({ etapa, comConferencia }: { etapa: number; comConferencia: boolean }) {
  const etapas = comConferencia ? ["Escolher arquivos", "Enviar", "Conferir dados"] : ["Escolher arquivos", "Enviar"];
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label="Etapas do envio">
      {etapas.map((rotulo, i) => {
        const numero = i + 1;
        const feita = numero < etapa;
        const atual = numero === etapa;
        return (
          <li key={rotulo} className="flex items-center gap-2" aria-current={atual ? "step" : undefined}>
            {i > 0 && <span className="h-px w-4 bg-border" aria-hidden />}
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border text-[10px] font-medium",
                atual && "border-primary bg-primary text-primary-foreground",
                feita && "border-primary text-primary",
                !atual && !feita && "text-muted-foreground",
              )}
            >
              {feita ? <Check className="size-3" aria-hidden /> : numero}
            </span>
            <span className={cn(atual ? "font-medium" : "text-muted-foreground")}>
              {rotulo}
              {feita && <span className="sr-only"> (concluída)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RevisarNomesDialog({
  itens,
  exigirFase,
  fases,
  tipos,
  disciplinas,
  codigoProjeto,
  padrao,
  larguraNumero,
  onCancel,
  onChange,
  onEscolherDisciplina,
  onEscolherPasta,
  onAlterarAlvo,
  onConfirm,
}: {
  itens: ItemEnvio[] | null;
  exigirFase: boolean;
  fases: FaseUpload[];
  tipos: FaseUpload[];
  /** Com a sigla GERAL do card na versão (null = card identificado só por sub) e as subs dele. */
  disciplinas: (Omit<DadosEnviarDocumentos["disciplinas"][number], "sigla"> & {
    sigla: string | null;
    subdisciplinas: { id: string; sigla: string }[];
  })[];
  codigoProjeto: string;
  padrao: string | null;
  larguraNumero: number;
  onCancel: () => void;
  onChange: (itens: ItemEnvio[]) => void;
  onEscolherDisciplina: (indice: number, disciplinaId: string) => void;
  onEscolherPasta: (indice: number, pastaId: string) => void;
  onAlterarAlvo: (indice: number, alvo: PacoteEnvio) => void;
  onConfirm: () => void;
}) {
  const foraDoPadraoCount = itens?.filter((item) => item.fora).length ?? 0;
  const temRenumerar = (item: ItemEnvio) => item.sugestoes.some((s) => s.tipo === "renumerar");
  const projetoErradoCount = itens?.filter(temRenumerar).length ?? 0;
  const precisaEscolherCount = itens?.filter((item) => item.precisaDisciplina || item.precisaPasta).length ?? 0;

  // Correção em lote (pedido do dono): renomear um por um era o único jeito quando vários
  // arquivos vinham errados — dois casos, o dono distinguiu os dois na resposta:
  // (1) número da prancha errado → mesmo fase+tipo, numeração em sequência a partir de um
  //     número inicial ("fora do padrão" — a extensão da checkbox pro caso 2 é o achado do
  //     advisor: o caso 1 não cobria "26027-EST-EX-4001-DET.pdf" no projeto 260032, que é
  //     estruturalmente válido (foraDoPadrao = false) e só aparece como sugestão "renumerar");
  // (2) código do projeto errado → já vem pronto na sugestão "renumerar" de cada item, só
  //     falta aplicar em massa nos selecionados (o valor correto já é sempre o mesmo,
  //     `ctx.projeto.codigo`, por construção — não precisa de input do usuário).
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [loteFaseId, setLoteFaseId] = useState("");
  const [loteTipoId, setLoteTipoId] = useState("");
  const [loteNumeroInicial, setLoteNumeroInicial] = useState("");

  // Diálogo fecha (enviado ou cancelado) e reabre depois com outro lote de arquivos — sem
  // isto, a seleção e os campos do lote anterior vazavam pro próximo `itens`.
  useEffect(() => {
    if (itens) return;
    setSelecionados(new Set());
    setLoteFaseId("");
    setLoteTipoId("");
    setLoteNumeroInicial("");
  }, [itens]);

  function alternarSelecionado(indice: number) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(indice)) novo.delete(indice);
      else novo.add(indice);
      return novo;
    });
  }

  function selecionarTodosForaDoPadrao() {
    if (!itens) return;
    setSelecionados(new Set(itens.map((item, i) => (item.fora ? i : -1)).filter((i) => i >= 0)));
  }

  function selecionarTodosComProjetoErrado() {
    if (!itens) return;
    setSelecionados(new Set(itens.map((item, i) => (temRenumerar(item) ? i : -1)).filter((i) => i >= 0)));
  }

  /** Fase+tipo iguais pra todos os selecionados, numeração sequencial a partir do inicial
   *  informado — cada item mantém a PRÓPRIA disciplina (código do projeto e sigla da
   *  disciplina de cada arquivo, nunca misturados entre disciplinas diferentes). Ignora
   *  selecionados que não estão "fora do padrão" — esses são resolvidos por
   *  `aplicarRenomeacaoDeProjetoEmLote`, não por este (evita renumerar em sequência um
   *  arquivo cujo problema era só o código do projeto). */
  function aplicarCorrecaoEmLote() {
    if (!itens || selecionados.size === 0) return;
    const fase = fases.find((f) => f.id === loteFaseId);
    const tipo = tipos.find((t) => t.id === loteTipoId);
    const numeroInicial = Number(loteNumeroInicial);
    if (!fase || !tipo || !Number.isInteger(numeroInicial) || numeroInicial < 0) return;
    let proximoNumero = numeroInicial;
    let semSigla = 0;
    const atualizados = itens.map((item, i) => {
      if (!selecionados.has(i) || !item.fora) return item;
      const disciplinaDoItem = item.disciplinaId ? disciplinas.find((d) => d.id === item.disciplinaId) : undefined;
      // No lugar da disciplina vai a sub lida do nome (padrão v2) ou a sigla geral do card.
      const siglaDisc = disciplinaDoItem ? siglaNoLugarDaDisciplina(disciplinaDoItem, item.subdisciplinaId) : null;
      if (!siglaDisc) {
        semSigla += 1;
        return item; // sem sigla cadastrada, não dá pra montar o nome — mantém como está
      }
      const numero = proximoNumero;
      proximoNumero += 1;
      const novoNome = nomeCorrigidoPeloPadrao({
        nomeOriginal: item.file.name,
        codigoProjeto,
        siglaDisciplina: siglaDisc,
        fase: fase.sigla,
        tipo: tipo.sigla,
        numeracao: numero,
        padrao,
        larguraNumero,
      });
      return { ...item, nome: novoNome, faseId: loteFaseId, tipoId: loteTipoId, fora: foraDoPadrao(novoNome, padrao) };
    });
    onChange(atualizados);
    if (semSigla > 0) {
      toast.error(`${semSigla} arquivo(s) não foram renomeados: disciplina sem sigla — use a correção de cada arquivo e escolha a sub-disciplina.`);
    }
    setSelecionados(new Set());
    setLoteFaseId("");
    setLoteTipoId("");
    setLoteNumeroInicial("");
  }

  /** Aplica a sugestão "renomear pro código do projeto correto" nos selecionados que a têm
   *  — o valor certo já vem pronto em `sugestao.nome` (sempre `ctx.projeto.codigo`, nunca
   *  precisa de input do usuário), então é só aceitar em massa. */
  function aplicarRenomeacaoDeProjetoEmLote() {
    if (!itens || selecionados.size === 0) return;
    const atualizados = itens.map((item, i) => {
      if (!selecionados.has(i)) return item;
      const sugestao = item.sugestoes.find((s) => s.tipo === "renumerar");
      if (!sugestao) return item;
      const semEsta = item.sugestoes.filter((s) => s !== sugestao);
      return { ...item, nome: sugestao.nome, fora: foraDoPadrao(sugestao.nome, padrao), sugestoes: semEsta };
    });
    onChange(atualizados);
    setSelecionados(new Set());
  }

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
    // Índices da seleção deslocam junto — senão, remover o arquivo 2 fazia a seleção do
    // arquivo 3 (agora no lugar do 2) ser tratada como se ainda fosse o 3 na hora do lote.
    setSelecionados((atual) => {
      const novo = new Set<number>();
      atual.forEach((i) => {
        if (i === indice) return;
        novo.add(i > indice ? i - 1 : i);
      });
      return novo;
    });
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
            {precisaEscolherCount > 0 && ` ${precisaEscolherCount} arquivo(s) precisam de disciplina ou pasta escolhida à mão — o nome não deu essa informação.`}
            {foraDoPadraoCount > 0 && ` ${foraDoPadraoCount} arquivo(s) de Pranchas estão fora do padrão — renomeie, remova ou envie assim.`}
            {foraDoPadraoCount > 0 && (
              <span className="mt-1 block font-mono text-[11px]">
                Padrão: {padrao?.trim() || "{proj}-{disc}-{fase}-{nº}-{tipo}"}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {(() => {
          const numeroInicial = Number(loteNumeroInicial);
          const fase = fases.find((f) => f.id === loteFaseId);
          const tipo = tipos.find((t) => t.id === loteTipoId);
          // Ordena por índice: Set guarda ordem de inserção, mas aplicarCorrecaoEmLote numera
          // em ordem do array — sem isto, marcar fora de ordem (o motivo do recurso existir)
          // fazia a prévia mostrar o nome de um arquivo que nunca ficaria com esse número.
          const indicePreview = itens ? [...selecionados].sort((a, b) => a - b).find((i) => itens[i]?.fora) : undefined;
          const itemPreview = indicePreview !== undefined ? itens?.[indicePreview] : undefined;
          const disciplinaPreview = itemPreview?.disciplinaId ? disciplinas.find((d) => d.id === itemPreview.disciplinaId) : undefined;
          const siglaPreview = disciplinaPreview ? siglaNoLugarDaDisciplina(disciplinaPreview, itemPreview?.subdisciplinaId) : null;
          const nomePreview = fase && tipo && siglaPreview && itemPreview
            && Number.isInteger(numeroInicial) && numeroInicial >= 0
            ? nomeCorrigidoPeloPadrao({
                nomeOriginal: itemPreview.file.name,
                codigoProjeto,
                siglaDisciplina: siglaPreview,
                fase: fase.sigla,
                tipo: tipo.sigla,
                numeracao: numeroInicial,
                padrao,
                larguraNumero,
              })
            : null;
          const selecionadosComProjetoErrado = itens ? [...selecionados].filter((i) => itens[i] && temRenumerar(itens[i])).length : 0;
          const selecionadosForaDoPadrao = itens ? [...selecionados].filter((i) => itens[i]?.fora).length : 0;
          return (foraDoPadraoCount > 1 || projetoErradoCount > 1) && (
            <div className="space-y-2 rounded-md border border-dashed bg-muted/30 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium">Corrigir vários de uma vez</p>
                <div className="flex flex-wrap gap-2">
                  {foraDoPadraoCount > 1 && (
                    <button
                      type="button"
                      className="text-[11px] text-primary underline hover:no-underline"
                      onClick={selecionarTodosForaDoPadrao}
                    >
                      Marcar todos fora do padrão ({foraDoPadraoCount})
                    </button>
                  )}
                  {projetoErradoCount > 1 && (
                    <button
                      type="button"
                      className="text-[11px] text-primary underline hover:no-underline"
                      onClick={selecionarTodosComProjetoErrado}
                    >
                      Marcar todos com projeto errado ({projetoErradoCount})
                    </button>
                  )}
                </div>
              </div>
              {selecionadosComProjetoErrado > 0 && (
                <div className="flex items-center justify-between gap-2 rounded bg-background/60 p-1.5">
                  <p className="text-[11px] text-muted-foreground">
                    {selecionadosComProjetoErrado} com código de projeto errado — renomeia pro código certo, sem mexer no resto do nome.
                  </p>
                  <Button size="xs" variant="secondary" onClick={aplicarRenomeacaoDeProjetoEmLote}>
                    Corrigir projeto ({selecionadosComProjetoErrado})
                  </Button>
                </div>
              )}
              {selecionadosForaDoPadrao > 0 && (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    {selecionadosForaDoPadrao} fora do padrão selecionado(s) — mesma fase e tipo, numeração em sequência a partir do número inicial.
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Fase</Label>
                      <Select value={loteFaseId} onValueChange={(v) => v && setLoteFaseId(v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                        <SelectContent>
                          {fases.map((f) => <SelectItem key={f.id} value={f.id}>{f.sigla} · {f.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Tipo</Label>
                      <Select value={loteTipoId} onValueChange={(v) => v && setLoteTipoId(v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                        <SelectContent>
                          {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.sigla} · {t.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Número inicial</Label>
                      <Input
                        type="number"
                        min="0"
                        value={loteNumeroInicial}
                        onChange={(event) => setLoteNumeroInicial(event.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  {nomePreview && <p className="text-[11px] text-muted-foreground">Ex.: {nomePreview}</p>}
                  <Button
                    size="xs"
                    variant="secondary"
                    disabled={!loteFaseId || !loteTipoId || loteNumeroInicial.trim() === ""}
                    onClick={aplicarCorrecaoEmLote}
                  >
                    Aplicar a {selecionadosForaDoPadrao} arquivo(s)
                  </Button>
                </>
              )}
            </div>
          );
        })()}

        <div className="space-y-2">
          {itens?.map((item, indice) => {
            const { extensao } = separarExtensao(item.file.name);
            const nomeBase = item.nome.endsWith(extensao) ? item.nome.slice(0, item.nome.length - extensao.length) : item.nome;
            const disciplinaDoItem = item.disciplinaId ? disciplinas.find((d) => d.id === item.disciplinaId) : undefined;
            const dadosCorrecao: DadosCorrecaoNomeUpload | null = disciplinaDoItem
              ? {
                  codigoProjeto,
                  siglaDisciplina: disciplinaDoItem.sigla,
                  subdisciplinas: disciplinaDoItem.subdisciplinas,
                  subdisciplinaId: item.subdisciplinaId,
                  fases,
                  tipos,
                  padrao,
                  larguraNumero,
                }
              : null;
            return (
              <div key={`${item.file.name}-${indice}`} className="flex items-start gap-2 rounded-md border p-2">
                {(item.fora || temRenumerar(item)) && (
                  <Checkbox
                    className="mt-0.5 shrink-0"
                    checked={selecionados.has(indice)}
                    onCheckedChange={() => alternarSelecionado(indice)}
                    aria-label={`Selecionar ${item.file.name} pra correção em lote`}
                  />
                )}
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

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Disciplina{item.precisaDisciplina ? " — não reconhecida pelo nome" : ""}
                      </Label>
                      <Select
                        value={item.disciplinaId ?? ""}
                        onValueChange={(value) => value && onEscolherDisciplina(indice, value)}
                      >
                        <SelectTrigger className={cn("h-8 text-xs", !item.disciplinaId && "text-muted-foreground")}>
                          <SelectValue placeholder="Selecione…" />
                        </SelectTrigger>
                        <SelectContent>
                          {disciplinas.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {disciplinaDoItem && !disciplinaDoItem.usaPastas && (
                      <div className="space-y-1">
                        <Label className="text-xs">Destino</Label>
                        <Select value={item.alvo} onValueChange={(value) => value && onAlterarAlvo(indice, value as PacoteEnvio)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A">Pranchas e arquivos</SelectItem>
                            <SelectItem value="B">Backup do modelo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {disciplinaDoItem?.usaPastas && (
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Pasta{item.precisaPasta ? ` — ${disciplinaDoItem.nome} usa pastas, não pacotes` : ""}
                      </Label>
                      <SeletorPasta
                        pastas={disciplinaDoItem.pastas}
                        value={item.pastaId ?? ""}
                        onChange={(pastaId) => pastaId && onEscolherPasta(indice, pastaId)}
                      />
                    </div>
                  )}

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
                      onAplicar={(nome) => alterar(indice, { nome, fora: foraDoPadrao(nome, padrao) })}
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
          <Button
            onClick={onConfirm}
            disabled={
              !itens || itens.length === 0
              || itens.some((item) => item.precisaDisciplina || item.precisaPasta)
              || (exigirFase && itens.some((item) => !item.faseId))
            }
          >
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
