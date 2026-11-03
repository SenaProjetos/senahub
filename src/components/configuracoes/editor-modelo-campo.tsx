"use client";

import { useId, type CSSProperties } from "react";
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
import { ChevronDown, ChevronRight, GripVertical, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { OPCOES_SIM_NAO, type CampoBriefing, type CampoTipo } from "@/modules/inputs/briefing-schema";
import {
  FORMATOS_PERMITIDOS,
  ROTULO_FORMATO,
  ROTULO_TIPO,
  TIPOS_DE_CAMPO,
  grupoDoTipo,
  tipoUsaOpcoes,
} from "@/modules/inputs/modelo-schema";
import { itensDaPerguntaDoModelo } from "@/modules/inputs/acoes-modelo";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { instrucoesDnd, anunciosDnd } from "./dnd-pt-br";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const SEM_FORMATO = "__sem_formato";

/** O que a lista de opções pede ao editor: cada mudança vai pelo esquema (a condição e a origem acompanham). */
export type OperacoesDeOpcao = {
  renomear: (chave: string, indice: number, texto: string) => void;
  remover: (chave: string, indice: number) => void;
  adicionar: (chave: string) => void;
  reordenar: (chave: string, de: number, para: number) => void;
};

function estiloArrasto(transform: { x: number; y: number } | null, transition: string | undefined, arrastando: boolean): CSSProperties {
  return {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: arrastando ? 0.6 : 1,
  };
}

/** Uma pergunta do modelo: recolhida (uma linha, arrastável) ou aberta para editar. */
export function CampoDoModelo({
  campo,
  numero,
  aberto,
  focar,
  tipoSalvo,
  outrasSecoes,
  onAbrir,
  onMudar,
  onAcao,
  controladoras,
  onOpcao,
}: {
  /** Perguntas de escolha que vêm antes desta (podem controlar quando ela aparece). */
  controladoras: CampoBriefing[];
  onOpcao: OperacoesDeOpcao;
  campo: CampoBriefing;
  numero: number;
  aberto: boolean;
  focar: boolean;
  /** Tipo com que a pergunta já está SALVA (nulo = pergunta nova, sem restrição de tipo). */
  tipoSalvo: CampoTipo | null;
  outrasSecoes: { id: string; titulo: string }[];
  onAbrir: () => void;
  onMudar: (patch: Partial<Omit<CampoBriefing, "chave">>) => void;
  onAcao: (acao: AcaoItemAcao) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: campo.chave });
  const itens = itensDaPerguntaDoModelo(outrasSecoes);
  const incompleta = !campo.label.trim() || (tipoUsaOpcoes(campo.tipo) && campo.tipo !== "checkbox-single" && (campo.opcoes?.length ?? 0) < 2);

  return (
    <LinhaComMenu
      itens={itens}
      onSelect={onAcao}
      render={
        <li
          ref={setNodeRef}
          style={estiloArrasto(transform, transition, isDragging)}
          className={cn("rounded-sm border bg-background data-[popup-open]:bg-muted/30", aberto && "border-primary/50")}
        />
      }
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          className="cursor-grab touch-none rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`Arrastar a pergunta ${campo.label || "sem texto"}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          onClick={onAbrir}
          aria-expanded={aberto}
          aria-controls={`painel-${campo.chave}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-1 text-left text-sm focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {aberto ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
          <span className="shrink-0 text-xs text-muted-foreground">{numero}.</span>
          <span className={cn("truncate", !campo.label.trim() && "italic text-muted-foreground")}>
            {campo.label.trim() || "Pergunta sem texto"}
            {campo.obrigatorio && (
              <span className="ml-1 text-destructive">
                <span aria-hidden>*</span>
                <span className="sr-only"> (obrigatória)</span>
              </span>
            )}
          </span>
        </button>
        {incompleta && (
          <Badge
            variant="destructive"
            className="shrink-0"
            title={!campo.label.trim() ? "Falta o texto da pergunta." : "Informe pelo menos duas opções."}
          >
            Incompleta
          </Badge>
        )}
        {campo.condicao && (
          <Badge variant="secondary" className="shrink-0" title="Só aparece conforme a resposta de outra pergunta.">
            Condicional
          </Badge>
        )}
        <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
          {ROTULO_TIPO[campo.tipo]}
        </Badge>
        <BotaoAcoes itens={itens} onSelect={onAcao} rotulo={`Ações da pergunta ${campo.label || "sem texto"}`} />
      </div>
      {aberto && <EditorDoCampo campo={campo} tipoSalvo={tipoSalvo} focar={focar} onMudar={onMudar} controladoras={controladoras} onOpcao={onOpcao} />}
    </LinhaComMenu>
  );
}

function EditorDoCampo({
  campo,
  tipoSalvo,
  focar,
  onMudar,
  controladoras,
  onOpcao,
}: {
  controladoras: CampoBriefing[];
  onOpcao: OperacoesDeOpcao;
  campo: CampoBriefing;
  tipoSalvo: CampoTipo | null;
  /** Pergunta recém-criada: o foco vai para o campo do texto. */
  focar: boolean;
  onMudar: (patch: Partial<Omit<CampoBriefing, "chave">>) => void;
}) {
  const id = useId();
  // Pergunta já salva só troca por tipo do mesmo grupo (a resposta gravada não muda de forma).
  const tiposPermitidos = tipoSalvo ? TIPOS_DE_CAMPO.filter((t) => grupoDoTipo(t) === grupoDoTipo(tipoSalvo)) : TIPOS_DE_CAMPO;

  return (
    <div id={`painel-${campo.chave}`} className="space-y-3 border-t px-3 py-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-label`} className="text-xs">
            Pergunta
          </Label>
          <Input id={`${id}-label`} value={campo.label} maxLength={300} autoFocus={focar} onChange={(e) => onMudar({ label: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-tipo`} className="text-xs">
            Tipo de resposta
          </Label>
          <Select value={campo.tipo} onValueChange={(v) => v && onMudar({ tipo: v as CampoTipo })}>
            <SelectTrigger id={`${id}-tipo`} className="w-full" aria-describedby={tipoSalvo ? `${id}-tipo-ajuda` : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tiposPermitidos.map((t) => (
                <SelectItem key={t} value={t}>
                  {ROTULO_TIPO[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {tipoSalvo && tiposPermitidos.length < TIPOS_DE_CAMPO.length && (
        <p id={`${id}-tipo-ajuda`} className="text-xs text-muted-foreground">
          Esta pergunta já existe no formulário: só troca por tipos parecidos, para não bagunçar as respostas já dadas.
          Para outro tipo, crie uma pergunta nova e exclua esta.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-hint`} className="text-xs">
          Texto de apoio (opcional)
        </Label>
        <Input id={`${id}-hint`} value={campo.hint ?? ""} maxLength={500} onChange={(e) => onMudar({ hint: e.target.value })} />
      </div>

      {(campo.tipo === "text" || campo.tipo === "textarea") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-ph`} className="text-xs">
              Exemplo no campo (opcional)
            </Label>
            <Input id={`${id}-ph`} value={campo.placeholder ?? ""} maxLength={160} onChange={(e) => onMudar({ placeholder: e.target.value })} />
          </div>
          {campo.tipo === "text" && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-fmt`} className="text-xs">
                Formato
              </Label>
              <Select
                value={campo.formato ?? SEM_FORMATO}
                onValueChange={(v) => onMudar({ formato: !v || v === SEM_FORMATO ? undefined : (v as CampoBriefing["formato"]) })}
              >
                <SelectTrigger id={`${id}-fmt`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_FORMATO}>Texto livre</SelectItem>
                  {FORMATOS_PERMITIDOS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {ROTULO_FORMATO[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {campo.tipo === "sim-nao" && <p className="text-xs text-muted-foreground">As opções são fixas: Sim e Não.</p>}

      {campo.tipo === "checkbox-single" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-ciente`} className="text-xs">
            Texto ao lado da caixa
          </Label>
          <Input
            id={`${id}-ciente`}
            value={campo.opcoes?.[0] ?? ""}
            maxLength={300}
            onChange={(e) => onMudar({ opcoes: [e.target.value] })}
            placeholder="Ex.: Li e estou ciente"
          />
        </div>
      )}

      {tipoUsaOpcoes(campo.tipo) && campo.tipo !== "checkbox-single" && (
        <OpcoesDoCampo chave={campo.chave} opcoes={campo.opcoes ?? []} onOpcao={onOpcao} />
      )}

      <CondicaoDoCampo campo={campo} controladoras={controladoras} onMudar={onMudar} />

      <div className="flex items-center gap-2 pt-1">
        <Switch id={`${id}-obrig`} checked={campo.obrigatorio} onCheckedChange={(v: boolean) => onMudar({ obrigatorio: v })} />
        <Label htmlFor={`${id}-obrig`} className="text-sm">
          Resposta obrigatória
        </Label>
      </div>
    </div>
  );
}

/** "Aparece só se…": a pergunta controladora e as respostas dela que mostram esta pergunta. */
function CondicaoDoCampo({
  campo,
  controladoras,
  onMudar,
}: {
  campo: CampoBriefing;
  controladoras: CampoBriefing[];
  onMudar: (patch: Partial<Omit<CampoBriefing, "chave">>) => void;
}) {
  const id = useId();
  const condicao = campo.condicao;
  const ctrl = condicao ? controladoras.find((c) => c.chave === condicao.campo) : undefined;
  const opcoes = ctrl ? (ctrl.tipo === "sim-nao" ? [...OPCOES_SIM_NAO] : (ctrl.opcoes ?? [])) : [];

  if (controladoras.length === 0 && !condicao) {
    return (
      <p className="text-xs text-muted-foreground">
        Para esta pergunta aparecer só conforme outra resposta, crie antes dela uma pergunta de escolha (sim ou não, lista, escolha única ou caixas).
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-sm border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Switch
          id={`${id}-cond`}
          checked={!!condicao}
          onCheckedChange={(v: boolean) => {
            if (!v) return onMudar({ condicao: undefined });
            const primeira = controladoras[0];
            const ops = primeira.tipo === "sim-nao" ? OPCOES_SIM_NAO[0] : (primeira.opcoes?.[0] ?? "");
            onMudar({ condicao: { campo: primeira.chave, igual: [ops] } });
          }}
        />
        <Label htmlFor={`${id}-cond`} className="text-sm">
          Mostrar só quando outra pergunta tiver certa resposta
        </Label>
      </div>
      {condicao && (
        <div className="space-y-2 sm:pl-10">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-ctrl`} className="text-xs">
              Pergunta que controla
            </Label>
            <Select
              value={condicao.campo}
              onValueChange={(v) => {
                const nova = controladoras.find((c) => c.chave === v);
                if (!nova) return;
                const ops = nova.tipo === "sim-nao" ? OPCOES_SIM_NAO[0] : (nova.opcoes?.[0] ?? "");
                onMudar({ condicao: { campo: nova.chave, igual: [ops] } });
              }}
            >
              <SelectTrigger id={`${id}-ctrl`} className="w-full" aria-label="Pergunta que controla">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {controladoras.map((c) => (
                  <SelectItem key={c.chave} value={c.chave}>
                    {c.label.trim() || "Pergunta sem texto"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium">A pergunta aparece quando a resposta for</legend>
            {opcoes.map((o) => {
              const marcada = condicao.igual.includes(o);
              const ultima = marcada && condicao.igual.length === 1;
              return (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={marcada}
                    disabled={ultima}
                    onChange={() =>
                      onMudar({ condicao: { campo: condicao.campo, igual: marcada ? condicao.igual.filter((x) => x !== o) : [...condicao.igual, o] } })
                    }
                  />
                  <span>{o}</span>
                </label>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Marque ao menos uma. Quando a pergunta fica escondida, ela não é exigida e a resposta já dada fica guardada.
            </p>
          </fieldset>
        </div>
      )}
    </div>
  );
}

function OpcoesDoCampo({ chave, opcoes, onOpcao }: { chave: string; opcoes: string[]; onOpcao: OperacoesDeOpcao }) {
  const rotuloId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = opcoes.map((_, i) => `op-${i}`);

  function aoSoltar(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const de = ids.indexOf(String(active.id));
    const para = ids.indexOf(String(over.id));
    if (de < 0 || para < 0) return;
    onOpcao.reordenar(chave, de, para);
  }

  return (
    <div role="group" aria-labelledby={rotuloId} className="space-y-1.5">
      <span id={rotuloId} className="text-xs font-medium">
        Opções
      </span>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={aoSoltar}
        accessibility={{ screenReaderInstructions: instrucoesDnd, announcements: anunciosDnd("a opção") }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {opcoes.map((op, i) => (
              <OpcaoLinha
                key={ids[i]}
                id={ids[i]}
                valor={op}
                indice={i}
                podeRemover={opcoes.length > 2}
                onMudar={(v) => onOpcao.renomear(chave, i, v)}
                onRemover={() => {
                  onOpcao.remover(chave, i);
                  // A linha some e leva o foco junto: devolve ao botão de adicionar opção.
                  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`${rotuloId}-add`)?.focus()));
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <Button id={`${rotuloId}-add`} type="button" variant="outline" size="sm" onClick={() => onOpcao.adicionar(chave)}>
        <Plus className="size-3.5" /> Adicionar opção
      </Button>
      <p className="text-xs text-muted-foreground">
        Renomear uma opção não altera as respostas já dadas: quem escolheu o texto antigo continua com ele guardado.
      </p>
    </div>
  );
}

function OpcaoLinha({
  id,
  valor,
  indice,
  podeRemover,
  onMudar,
  onRemover,
}: {
  id: string;
  valor: string;
  indice: number;
  podeRemover: boolean;
  onMudar: (v: string) => void;
  onRemover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={estiloArrasto(transform, transition, isDragging)} className="flex items-center gap-1.5">
      <button
        type="button"
        className="cursor-grab touch-none rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Arrastar a opção ${indice + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <Input value={valor} maxLength={300} aria-label={`Opção ${indice + 1}`} onChange={(e) => onMudar(e.target.value)} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remover a opção ${indice + 1}`}
        aria-disabled={!podeRemover}
        title={podeRemover ? undefined : "É preciso ao menos duas opções."}
        className={podeRemover ? undefined : "opacity-50"}
        onClick={() => podeRemover && onRemover()}
      >
        <X className="size-4" />
      </Button>
    </li>
  );
}
