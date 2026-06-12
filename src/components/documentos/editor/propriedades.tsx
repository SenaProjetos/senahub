"use client";

import type { Dispatch } from "react";
import { Trash2, Copy } from "lucide-react";
import {
  BANDA_LABEL,
  novoId,
  type Banda,
  type DocSchema,
  type Elemento,
} from "@/modules/documentos/schema";
import { fonteDef } from "@/modules/documentos/fontes-meta";
import type { EditorAction, Selecao } from "./estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Propriedades({
  schema,
  selecao,
  fonte,
  dispatch,
}: {
  schema: DocSchema;
  selecao: Selecao;
  fonte: string;
  dispatch: Dispatch<EditorAction>;
}) {
  const banda =
    selecao.tipo !== "nenhuma" ? schema.bandas.find((b) => b.id === selecao.bandaId) : undefined;
  const elemento =
    selecao.tipo === "elemento" && banda
      ? banda.elementos.find((e) => e.id === selecao.elementoId)
      : undefined;

  return (
    <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-l bg-card p-4">
      <h3 className="text-sm font-bold">Propriedades</h3>

      {!banda && (
        <p className="text-xs text-muted-foreground">
          Selecione uma banda (faixa à esquerda) ou um elemento no canvas. Use a paleta para
          adicionar elementos à banda selecionada.
        </p>
      )}

      {banda && !elemento && <PropsBanda banda={banda} schema={schema} dispatch={dispatch} />}
      {banda && elemento && (
        <PropsElemento bandaId={banda.id} el={elemento} fonte={fonte} dispatch={dispatch} />
      )}
    </aside>
  );
}

function PropsBanda({
  banda,
  schema,
  dispatch,
}: {
  banda: Banda;
  schema: DocSchema;
  dispatch: Dispatch<EditorAction>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">{BANDA_LABEL[banda.tipo]}</p>
      <Campo label="Altura (px)">
        <Input
          type="number"
          value={banda.altura}
          onChange={(e) =>
            dispatch({
              t: "alturaBanda",
              bandaId: banda.id,
              altura: Math.max(8, Number(e.target.value) || 8),
              commit: true,
            })
          }
        />
      </Campo>
      {banda.tipo === "detalhe" && (
        <p className="text-xs text-muted-foreground">
          Esta banda repete uma vez por linha da coleção da fonte de dados (ex.: disciplinas do
          projeto). Monte aqui a “linha da tabela”.
        </p>
      )}
      {schema.bandas.length > 1 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => dispatch({ t: "removeBanda", bandaId: banda.id })}
        >
          <Trash2 className="size-3.5" /> Remover banda
        </Button>
      )}
    </div>
  );
}

function PropsElemento({
  bandaId,
  el,
  fonte,
  dispatch,
}: {
  bandaId: string;
  el: Elemento;
  fonte: string;
  dispatch: Dispatch<EditorAction>;
}) {
  const def = fonteDef(fonte);
  const upd = (patch: Partial<Elemento>, commit = true) =>
    dispatch({ t: "updateElemento", bandaId, elementoId: el.id, patch, commit });
  const updEstilo = (patch: Partial<Elemento["estilo"]>) =>
    upd({ estilo: { ...el.estilo, ...patch } });

  const tokens: { valor: string; label: string }[] = def
    ? [
        ...def.escalares.map((c) => ({ valor: `[${c.chave}]`, label: c.label })),
        ...(def.colecao
          ? def.colecao.campos.map((c) => ({
              valor: `[${c.chave}]`,
              label: `${def.colecao!.label} · ${c.label}`,
            }))
          : []),
        ...(def.colecao
          ? [{ valor: `[Sum(${def.colecao.campos.find((c) => /valor/i.test(c.chave))?.chave ?? def.colecao.campos[0].chave}):c2]`, label: "Soma da coleção (R$)" }]
          : []),
        { valor: "[Hoje]", label: "Data de hoje" },
        { valor: "[Pagina] de [Paginas]", label: "Página X de Y" },
      ]
    : [];

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold capitalize text-muted-foreground">{el.tipo}</p>

      {(el.tipo === "label" || el.tipo === "campo") && (
        <>
          <Campo label="Texto">
            <textarea
              rows={3}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={el.texto}
              onChange={(e) => upd({ texto: e.target.value }, false)}
              onBlur={(e) => upd({ texto: e.target.value })}
            />
          </Campo>
          {tokens.length > 0 && (
            <Campo label="Inserir campo">
              <Select value="" onValueChange={(v) => v && upd({ texto: el.texto + v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher token…" />
                </SelectTrigger>
                <SelectContent>
                  {tokens.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          )}
        </>
      )}

      {el.tipo === "imagem" && (
        <Campo label="URL / caminho da imagem">
          <Input
            value={el.texto}
            onChange={(e) => upd({ texto: e.target.value }, false)}
            onBlur={(e) => upd({ texto: e.target.value })}
            placeholder="/MARCA/logo_completa_light.svg"
          />
        </Campo>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Campo label="X">
          <Input type="number" value={el.x} onChange={(e) => upd({ x: Number(e.target.value) || 0 })} />
        </Campo>
        <Campo label="Y">
          <Input type="number" value={el.y} onChange={(e) => upd({ y: Number(e.target.value) || 0 })} />
        </Campo>
        <Campo label="Largura">
          <Input type="number" value={el.w} onChange={(e) => upd({ w: Math.max(4, Number(e.target.value) || 4) })} />
        </Campo>
        <Campo label="Altura">
          <Input type="number" value={el.h} onChange={(e) => upd({ h: Math.max(4, Number(e.target.value) || 4) })} />
        </Campo>
      </div>

      {el.tipo !== "linha" && el.tipo !== "imagem" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Fonte (px)">
              <Input
                type="number"
                value={el.estilo.fontSize}
                onChange={(e) => updEstilo({ fontSize: Number(e.target.value) || 12 })}
              />
            </Campo>
            <Campo label="Alinhamento">
              <Select
                value={el.estilo.align}
                onValueChange={(v) => updEstilo({ align: (v as "left" | "center" | "right") ?? "left" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Esquerda</SelectItem>
                  <SelectItem value="center">Centro</SelectItem>
                  <SelectItem value="right">Direita</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={el.estilo.bold}
                onChange={(e) => updEstilo({ bold: e.target.checked })}
              />
              Negrito
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={el.estilo.italic}
                onChange={(e) => updEstilo({ italic: e.target.checked })}
              />
              Itálico
            </label>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Campo label="Cor do texto">
          <Input
            value={el.estilo.color}
            onChange={(e) => updEstilo({ color: e.target.value })}
            placeholder="#1C2D58"
          />
        </Campo>
        <Campo label="Fundo">
          <Input
            value={el.estilo.bg}
            onChange={(e) => updEstilo({ bg: e.target.value })}
            placeholder="transparente"
          />
        </Campo>
        <Campo label="Borda (px)">
          <Input
            type="number"
            value={el.estilo.borderW}
            onChange={(e) => updEstilo({ borderW: Number(e.target.value) || 0 })}
          />
        </Campo>
        <Campo label="Cor da borda">
          <Input
            value={el.estilo.borderColor}
            onChange={(e) => updEstilo({ borderColor: e.target.value })}
          />
        </Campo>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={el.travado}
            onChange={(e) => upd({ travado: e.target.checked })}
          />
          Travado
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={el.visivel}
            onChange={(e) => upd({ visivel: e.target.checked })}
          />
          Visível
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => dispatch({ t: "duplicarElemento", bandaId, elementoId: el.id, novoId: novoId() })}
        >
          <Copy className="size-3.5" /> Duplicar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => dispatch({ t: "removeElemento", bandaId, elementoId: el.id })}
        >
          <Trash2 className="size-3.5" /> Excluir
        </Button>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
