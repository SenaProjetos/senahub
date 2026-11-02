"use client";

import { useEffect, useId, useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { FileQuestion, GripVertical, Plus, Save } from "lucide-react";
import { salvarModeloBriefing } from "@/modules/inputs/modelo-actions";
import { SEM_OCULTOS, aplicarOcultos, type CampoTipo, type SecaoBriefing } from "@/modules/inputs/briefing-schema";
import { itensDaSecaoDoModelo } from "@/modules/inputs/acoes-modelo";
import {
  adicionarCampo,
  adicionarSecao,
  atualizarCampo,
  atualizarSecao,
  duplicarCampo,
  moverCampoParaSecao,
  removerCampo,
  removerSecao,
  reordenarCampos,
  reordenarSecoes,
} from "@/modules/inputs/modelo-editor";
import { validarEsquema } from "@/modules/inputs/modelo-schema";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { BriefingForm } from "@/components/inputs/briefing-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { instrucoesDnd, anunciosDnd } from "./dnd-pt-br";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { CampoDoModelo } from "./editor-modelo-campo";

type Modelo = {
  id: string;
  nome: string;
  descricao: string | null;
  padrao: boolean;
  ativo: boolean;
  versao: number;
  esquemaValido: boolean;
  secoes: SecaoBriefing[];
};

function tiposDe(secoes: readonly SecaoBriefing[]): Map<string, CampoTipo> {
  return new Map(secoes.flatMap((s) => s.campos).map((c) => [c.chave, c.tipo]));
}

const instantaneo = (nome: string, descricao: string, secoes: readonly SecaoBriefing[]) => JSON.stringify({ nome, descricao, secoes });

/** Editor de um modelo de formulário: seções e perguntas em cartões, arrastar para ordenar, pré-visualização. */
export function EditorModeloBriefing({ modelo }: { modelo: Modelo }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState(modelo.nome);
  const [descricao, setDescricao] = useState(modelo.descricao ?? "");
  const [secoes, setSecoes] = useState<SecaoBriefing[]>(modelo.secoes);
  const [versao, setVersao] = useState(modelo.versao);
  const [salvo, setSalvo] = useState(() => ({
    foto: instantaneo(modelo.nome, modelo.descricao ?? "", modelo.secoes),
    tipos: tiposDe(modelo.secoes),
  }));
  const [aba, setAba] = useState<"editar" | "previa">("editar");
  const [aberto, setAberto] = useState<string | null>(null);
  const [focarNova, setFocarNova] = useState<string | null>(null);

  const sujo = instantaneo(nome, descricao, secoes) !== salvo.foto;

  // Fechar a aba com alteração pendente: o navegador pergunta.
  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function aoSoltarSecao(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) setSecoes((s) => reordenarSecoes(s, String(active.id), String(over.id)));
  }

  function salvar() {
    const v = validarEsquema(secoes);
    if (!v.ok) {
      toast.error(v.erro);
      return;
    }
    start(async () => {
      try {
        const r = await salvarModeloBriefing({ id: modelo.id, versao, nome, descricao, esquema: secoes });
        if (r.ok) {
          setVersao(r.data.versao);
          setSalvo({ foto: instantaneo(nome, descricao, secoes), tipos: tiposDe(secoes) });
          toast.success("Modelo salvo.");
          router.refresh();
        } else toast.error(r.error);
      } catch {
        toast.error("Não foi possível salvar. Verifique a conexão e tente de novo.");
      }
    });
  }

  async function aoAcaoCampo(chave: string, acao: AcaoItemAcao) {
    // Confirmar ANTES de qualquer transição/atualização de estado.
    if (acao.confirmar) {
      const ok = await confirm({
        title: acao.confirmar.titulo,
        description: acao.confirmar.descricao,
        confirmLabel: acao.confirmar.rotuloConfirmar,
        variant: "destructive",
      });
      if (!ok) return;
    }
    if (acao.id === "duplicar") setSecoes((s) => duplicarCampo(s, chave));
    else if (acao.id === "excluir") {
      // O item some e leva o foco junto: devolve ao botão de adicionar pergunta da mesma seção.
      const secaoId = secoes.find((x) => x.campos.some((c) => c.chave === chave))?.id;
      setSecoes((s) => removerCampo(s, chave));
      if (secaoId) focarDepois(`modelo-add-pergunta-${secaoId}`);
    }
    else if (acao.id.startsWith("mover:")) setSecoes((s) => moverCampoParaSecao(s, chave, acao.id.slice("mover:".length)));
  }

  async function aoAcaoSecao(id: string, acao: AcaoItemAcao) {
    if (acao.confirmar) {
      const ok = await confirm({
        title: acao.confirmar.titulo,
        description: acao.confirmar.descricao,
        confirmLabel: acao.confirmar.rotuloConfirmar,
        variant: "destructive",
      });
      if (!ok) return;
    }
    if (acao.id === "excluir") {
      setSecoes((s) => removerSecao(s, id));
      focarDepois("modelo-add-secao");
    }
  }

  function novaPergunta(secaoId: string) {
    const ate = secoes.find((s) => s.id === secaoId)?.campos.length ?? 0;
    const novas = adicionarCampo(secoes, secaoId);
    setSecoes(novas);
    const criada = novas.find((s) => s.id === secaoId)?.campos[ate];
    if (criada) {
      setAberto(criada.chave);
      setFocarNova(criada.chave);
    }
  }

  const previa = useMemo(() => aplicarOcultos(secoes, SEM_OCULTOS), [secoes]);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Editar modelo de formulário"
        descricao="Monte as perguntas do briefing do cliente, arraste para reordenar e salve."
        trilha={[
          { href: "/configuracoes", label: "Configurações" },
          { href: "/configuracoes/inputs/modelos", label: "Modelos de formulário" },
          { label: modelo.nome },
        ]}
        acoes={
          <Button size="sm" onClick={salvar} disabled={pending || !sujo}>
            <Save className="size-3.5" /> {pending ? "Salvando…" : "Salvar"}
          </Button>
        }
      />

      {!modelo.esquemaValido && (
        <p role="alert" className="rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          O esquema gravado neste modelo está ilegível; os projetos que o usam mostram o formulário padrão embutido. Monte as
          seções de novo e salve.
        </p>
      )}

      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="modelo-nome" className="text-xs">
              Nome do modelo
            </Label>
            <Input id="modelo-nome" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modelo-descricao" className="text-xs">
              Descrição (opcional)
            </Label>
            <Input id="modelo-descricao" value={descricao} maxLength={400} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
            {modelo.padrao && <Badge>Padrão</Badge>}
            {!modelo.ativo && <Badge variant="outline">Arquivado</Badge>}
            <span>Versão {versao}</span>
            {sujo && <span className="font-medium text-warning-text">Alterações não salvas</span>}
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={aba}
        onValueChange={(v) => {
          setFocarNova(null); // a pergunta recém-criada não pode roubar o foco de novo ao voltar para Editar
          setAba(v as "editar" | "previa");
        }}
      >
        <TabsList aria-label="Modo do editor" activateOnFocus>
          <TabsTrigger value="editar">Editar</TabsTrigger>
          <TabsTrigger value="previa">Pré-visualizar</TabsTrigger>
        </TabsList>
        <TabsContent value="previa" className="mt-3 text-base">
        {previa.length === 0 ? (
          <EmptyState
            icon={FileQuestion}
            title={modelo.esquemaValido ? "Nenhuma pergunta ainda" : "Formulário ilegível"}
            description={
              modelo.esquemaValido
                ? "Adicione perguntas na aba Editar para ver como o cliente as enxerga."
                : "O esquema gravado não pôde ser lido. Monte as seções de novo na aba Editar e salve."
            }
            action={
              <Button size="sm" variant="outline" onClick={() => setAba("editar")}>
                Ir para o editor
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="pt-5">
            <p className="mb-4 rounded-sm bg-muted px-3 py-2 text-xs text-foreground">
              Pré-visualização: é assim que o cliente vê o formulário. Nada do que for digitado aqui é gravado. As seções
              condicionadas a uma disciplina aparecem todas; no projeto, só as das disciplinas dele.
            </p>
            <BriefingForm key={JSON.stringify(previa)} respostasIniciais={{}} secoes={previa} previa onSalvar={async () => ({ ok: true })} />
            </CardContent>
          </Card>
        )}
        </TabsContent>
        <TabsContent value="editar" className="mt-3 text-base">
        <div className="space-y-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={aoSoltarSecao}
            accessibility={{ screenReaderInstructions: instrucoesDnd, announcements: anunciosDnd("a seção") }}
          >
            <SortableContext items={secoes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-3">
                {secoes.map((secao, i) => (
                  <SecaoDoModelo
                    key={secao.id}
                    secao={secao}
                    numero={i + 1}
                    ultima={secoes.length === 1}
                    outrasSecoes={secoes.filter((s) => s.id !== secao.id).map((s) => ({ id: s.id, titulo: s.titulo }))}
                    aberto={aberto}
                    focarNova={focarNova}
                    tipos={salvo.tipos}
                    onAbrir={(chave) => {
                      setFocarNova(null);
                      setAberto((a) => (a === chave ? null : chave));
                    }}
                    onSecao={(patch) => setSecoes((s) => atualizarSecao(s, secao.id, patch))}
                    onCampo={(chave, patch) => setSecoes((s) => atualizarCampo(s, chave, patch))}
                    onOrdemCampos={(de, para) => setSecoes((s) => reordenarCampos(s, secao.id, de, para))}
                    onAcaoCampo={aoAcaoCampo}
                    onAcaoSecao={(a) => aoAcaoSecao(secao.id, a)}
                    onNovaPergunta={() => novaPergunta(secao.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <Button id="modelo-add-secao" variant="outline" size="sm" onClick={() => setSecoes((s) => adicionarSecao(s))}>
            <Plus className="size-3.5" /> Adicionar seção
          </Button>
        </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Espera o React gravar a lista nova e põe o foco no elemento (depois de excluir, o botão de origem já não existe). */
function focarDepois(id: string) {
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.focus()));
}

function SecaoDoModelo({
  secao,
  numero,
  ultima,
  outrasSecoes,
  aberto,
  focarNova,
  tipos,
  onAbrir,
  onSecao,
  onCampo,
  onOrdemCampos,
  onAcaoCampo,
  onAcaoSecao,
  onNovaPergunta,
}: {
  secao: SecaoBriefing;
  numero: number;
  ultima: boolean;
  outrasSecoes: { id: string; titulo: string }[];
  aberto: string | null;
  focarNova: string | null;
  tipos: Map<string, CampoTipo>;
  onAbrir: (chave: string) => void;
  onSecao: (patch: Partial<Pick<SecaoBriefing, "titulo" | "descricao" | "disciplinas">>) => void;
  onCampo: (chave: string, patch: Parameters<typeof atualizarCampo>[2]) => void;
  onOrdemCampos: (de: string, para: string) => void;
  onAcaoCampo: (chave: string, acao: AcaoItemAcao) => void;
  onAcaoSecao: (acao: AcaoItemAcao) => void;
  onNovaPergunta: () => void;
}) {
  const id = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: secao.id });
  const estilo: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const itens = itensDaSecaoDoModelo({ titulo: secao.titulo, perguntas: secao.campos.length }, ultima);

  function aoSoltarCampo(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) onOrdemCampos(String(active.id), String(over.id));
  }

  return (
    <li ref={setNodeRef} style={estilo} className="rounded-sm border bg-card">
      <LinhaComMenu
        itens={itens}
        onSelect={onAcaoSecao}
        render={<div className="flex items-center gap-2 border-b bg-muted/30 px-2 py-1.5 data-[popup-open]:bg-muted/60" />}
      >
        <button
          type="button"
          className="cursor-grab touch-none rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`Arrastar a seção ${secao.titulo || numero}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="flex-1 text-xs font-bold uppercase tracking-wide text-foreground">Seção {numero}</span>
        <BotaoAcoes itens={itens} onSelect={onAcaoSecao} rotulo={`Ações da seção ${secao.titulo || numero}`} />
      </LinhaComMenu>

      <div className="space-y-3 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-titulo`} className="text-xs">
              Título da seção
            </Label>
            <Input id={`${id}-titulo`} value={secao.titulo} maxLength={120} onChange={(e) => onSecao({ titulo: e.target.value })} />
          </div>
          <TermosDeDisciplina id={`${id}-termos`} termos={secao.disciplinas} onMudar={(disciplinas) => onSecao({ disciplinas })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-desc`} className="text-xs">
            Descrição (opcional)
          </Label>
          <Input
            id={`${id}-desc`}
            value={secao.descricao ?? ""}
            maxLength={800}
            onChange={(e) => onSecao({ descricao: e.target.value })}
          />
        </div>

        {secao.campos.length === 0 ? (
          <p className="rounded-sm border border-dashed p-3 text-center text-xs text-muted-foreground">Seção sem perguntas.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={aoSoltarCampo}
            accessibility={{ screenReaderInstructions: instrucoesDnd, announcements: anunciosDnd("a pergunta") }}
          >
            <SortableContext items={secao.campos.map((c) => c.chave)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {secao.campos.map((campo, i) => (
                  <CampoDoModelo
                    key={campo.chave}
                    campo={campo}
                    numero={i + 1}
                    aberto={aberto === campo.chave}
                    focar={focarNova === campo.chave}
                    tipoSalvo={tipos.get(campo.chave) ?? null}
                    outrasSecoes={outrasSecoes}
                    onAbrir={() => onAbrir(campo.chave)}
                    onMudar={(patch) => onCampo(campo.chave, patch)}
                    onAcao={(a) => onAcaoCampo(campo.chave, a)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        <Button id={`modelo-add-pergunta-${secao.id}`} variant="outline" size="sm" onClick={onNovaPergunta}>
          <Plus className="size-3.5" /> Adicionar pergunta
        </Button>
      </div>
    </li>
  );
}

/** Termos que condicionam a seção à disciplina do projeto. Texto local; vira lista ao sair do campo. */
function TermosDeDisciplina({
  id,
  termos,
  onMudar,
}: {
  id: string;
  termos: string[] | undefined;
  onMudar: (termos: string[] | undefined) => void;
}) {
  const [texto, setTexto] = useState((termos ?? []).join(", "));
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        Só aparece se o projeto tiver a disciplina (opcional)
      </Label>
      <Input
        id={id}
        value={texto}
        placeholder="Ex.: elétric, hidro — vazio = sempre aparece"
        maxLength={200}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const lista = [...new Set(texto.split(",").map((t) => t.trim()).filter(Boolean))];
          setTexto(lista.join(", "));
          onMudar(lista.length > 0 ? lista : undefined);
        }}
      />
    </div>
  );
}
