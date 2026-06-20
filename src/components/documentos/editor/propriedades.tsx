"use client";

import { useRef, useState, type Dispatch } from "react";
import { toast } from "sonner";
import { Trash2, Copy, Upload, Loader2, Plus } from "lucide-react";
import {
  BANDA_LABEL,
  FORMATOS_FOLHA,
  ORIENTACOES,
  dimensoesPx,
  margemAbntPx,
  novoId,
  type Banda,
  type ColunaTabela,
  type DocSchema,
  type Elemento,
  type Orientacao,
} from "@/modules/documentos/schema";
import { fonteDef } from "@/modules/documentos/fontes-meta";
import type { FonteTipografica } from "@/modules/documentos/fontes-tipograficas";
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
  fontesHabilitadas,
  fonteColunas = [],
  dispatch,
}: {
  schema: DocSchema;
  selecao: Selecao;
  fonte: string;
  fontesHabilitadas: FonteTipografica[];
  /** Colunas do dataset (quando a fonte é `dataset:<id>`), para inserir tokens. */
  fonteColunas?: string[];
  dispatch: Dispatch<EditorAction>;
}) {
  const banda =
    selecao.tipo !== "nenhuma" ? schema.bandas.find((b) => b.id === selecao.bandaId) : undefined;
  const elemento =
    selecao.tipo === "elemento" && banda
      ? banda.elementos.find((e) => e.id === selecao.elementoId)
      : undefined;
  const multi = selecao.tipo === "multi" ? selecao.ids.length : 0;

  return (
    <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-l bg-card p-4">
      <h3 className="text-sm font-bold">Propriedades</h3>

      {multi > 0 && (
        <div className="space-y-2 border-b pb-3">
          <p className="text-xs font-semibold text-muted-foreground">Multi-seleção</p>
          <p className="text-xs text-muted-foreground">
            {multi} elementos selecionados. Use os botões de alinhar/distribuir na barra superior,
            arraste para mover em grupo ou salve a seleção como bloco.
          </p>
        </div>
      )}

      {selecao.tipo !== "multi" && !banda && !elemento && (
        <>
          <PropsPagina
            schema={schema}
            fonte={fonte}
            fonteColunas={fonteColunas}
            dispatch={dispatch}
          />
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Selecione uma banda (faixa à esquerda) ou um elemento no canvas. Use a paleta para
            adicionar elementos à banda selecionada.
          </p>
        </>
      )}

      {selecao.tipo !== "multi" && banda && !elemento && (
        <PropsBanda banda={banda} schema={schema} dispatch={dispatch} />
      )}
      {banda && elemento && (
        <PropsElemento
          bandaId={banda.id}
          el={elemento}
          fonte={fonte}
          fontesHabilitadas={fontesHabilitadas}
          fonteColunas={fonteColunas}
          dispatch={dispatch}
        />
      )}
    </aside>
  );
}

function PropsPagina({
  schema,
  fonte,
  fonteColunas = [],
  dispatch,
}: {
  schema: DocSchema;
  fonte: string;
  fonteColunas?: string[];
  dispatch: Dispatch<EditorAction>;
}) {
  const pg = schema.pagina;

  // Chaves da coleção (linhas) candidatas a agrupamento: campos da coleção da
  // fonte de sistema, ou colunas do dataset. Lista pode estar vazia (sem fonte).
  const def = fonteDef(fonte);
  const chavesColecao: string[] = def?.colecao
    ? def.colecao.campos.map((c) => c.chave)
    : fonte.startsWith("dataset:")
      ? fonteColunas
      : [];
  const agruparPor = schema.agruparPor ?? "";
  // Mantém visível um valor salvo que não esteja na lista (ex.: fonte trocada).
  const opcoesAgrupar =
    agruparPor && !chavesColecao.includes(agruparPor)
      ? [agruparPor, ...chavesColecao]
      : chavesColecao;
  const aplicarFormato = (formato: string, orientacao: Orientacao) => {
    const dim = dimensoesPx(formato, orientacao);
    dispatch({
      t: "updatePagina",
      patch: { formato, orientacao, largura: dim.largura, altura: dim.altura },
    });
  };
  const updMargem = (lado: keyof DocSchema["pagina"]["margem"], v: number) =>
    dispatch({ t: "updatePagina", patch: { margem: { ...pg.margem, [lado]: Math.max(0, v) } } });

  const marca = pg.marcaDagua;
  const updMarca = (patch: Partial<NonNullable<DocSchema["pagina"]["marcaDagua"]>>) =>
    dispatch({
      t: "updatePagina",
      patch: { marcaDagua: { texto: marca?.texto ?? "", opacidade: marca?.opacidade, ...patch } },
    });

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Página</p>
      <Campo label="Formato da folha">
        <Select
          value={FORMATOS_FOLHA[pg.formato] ? pg.formato : "A4"}
          onValueChange={(v) => v && aplicarFormato(v, pg.orientacao)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FORMATOS_FOLHA).map(([id, f]) => (
              <SelectItem key={id} value={id}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <Campo label="Orientação">
        <Select
          value={pg.orientacao}
          onValueChange={(v) => v && aplicarFormato(pg.formato, v as Orientacao)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORIENTACOES.map((o) => (
              <SelectItem key={o} value={o}>
                {o === "retrato" ? "Retrato" : "Paisagem"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <p className="text-[11px] text-muted-foreground">
        {pg.largura} × {pg.altura} px @96dpi
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Campo label="Margem topo">
          <Input
            type="number"
            value={pg.margem.topo}
            onChange={(e) => updMargem("topo", Number(e.target.value) || 0)}
          />
        </Campo>
        <Campo label="Margem direita">
          <Input
            type="number"
            value={pg.margem.direita}
            onChange={(e) => updMargem("direita", Number(e.target.value) || 0)}
          />
        </Campo>
        <Campo label="Margem baixo">
          <Input
            type="number"
            value={pg.margem.baixo}
            onChange={(e) => updMargem("baixo", Number(e.target.value) || 0)}
          />
        </Campo>
        <Campo label="Margem esquerda">
          <Input
            type="number"
            value={pg.margem.esquerda}
            onChange={(e) => updMargem("esquerda", Number(e.target.value) || 0)}
          />
        </Campo>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => dispatch({ t: "updatePagina", patch: { margem: margemAbntPx() } })}
      >
        Margens ABNT
      </Button>

      <div className="space-y-2 border-t pt-3">
        <p className="text-xs font-semibold text-muted-foreground">Marca d&apos;água</p>
        <Campo label="Texto (vazio = sem marca)">
          <Input
            value={marca?.texto ?? ""}
            onChange={(e) => updMarca({ texto: e.target.value })}
            placeholder="CONFIDENCIAL"
          />
        </Campo>
        <Campo label="Opacidade (0–1)">
          <Input
            type="number"
            step="0.01"
            min={0}
            max={1}
            value={marca?.opacidade ?? 0.08}
            onChange={(e) => {
              const v = Number(e.target.value);
              updMarca({ opacidade: isNaN(v) ? 0.08 : Math.min(1, Math.max(0, v)) });
            }}
          />
        </Campo>
      </div>

      <div className="space-y-2 border-t pt-3">
        <p className="text-xs font-semibold text-muted-foreground">Agrupamento (relatório)</p>
        <Campo label="Agrupar linhas por">
          {opcoesAgrupar.length > 0 ? (
            <Select
              value={agruparPor || "__none"}
              onValueChange={(v) =>
                dispatch({ t: "setAgrupamento", campo: !v || v === "__none" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem agrupamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem agrupamento</SelectItem>
                {opcoesAgrupar.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={agruparPor}
              onChange={(e) => dispatch({ t: "setAgrupamento", campo: e.target.value })}
              placeholder="Ex.: Disciplina (vazio = sem agrupamento)"
            />
          )}
        </Campo>
        <p className="text-[11px] text-muted-foreground">
          Com agrupamento, adicione as bandas “Cabeçalho de grupo” e “Rodapé de grupo
          (subtotal)”. Use o token <code>[Grupo]</code> para o valor do grupo e{" "}
          <code>[Sum(Valor)]</code> no rodapé do grupo para subtotais por grupo.
        </p>
      </div>
    </div>
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
      {banda.tipo === "grupoCabecalho" && (
        <p className="text-xs text-muted-foreground">
          Aparece uma vez no início de cada grupo (precisa de “Agrupar por” na Página). Use o
          token <code>[Grupo]</code> para o título do grupo.
        </p>
      )}
      {banda.tipo === "grupoRodape" && (
        <p className="text-xs text-muted-foreground">
          Aparece uma vez no fim de cada grupo. Agregados como <code>[Sum(Valor)]</code> somam
          apenas as linhas daquele grupo (subtotal).
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
  fontesHabilitadas,
  fonteColunas = [],
  dispatch,
}: {
  bandaId: string;
  el: Elemento;
  fonte: string;
  fontesHabilitadas: FonteTipografica[];
  fonteColunas?: string[];
  dispatch: Dispatch<EditorAction>;
}) {
  const def = fonteDef(fonte);
  const ehDataset = fonte.startsWith("dataset:");
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
          ? [{ valor: `[Sum(${def.colecao.campos.find((c) => /valor/i.test(c.chave))?.chave ?? def.colecao.campos[0].chave}):c2]`, label: "Soma da coleção / subtotal (R$)" }]
          : []),
        { valor: "[Grupo]", label: "Valor do grupo (banda de grupo)" },
        { valor: "[Hoje]", label: "Data de hoje" },
        { valor: "[Pagina] de [Paginas]", label: "Página X de Y" },
      ]
    : ehDataset
      ? [
          { valor: "[DatasetNome]", label: "Nome do dataset" },
          { valor: "[TotalLinhas]", label: "Total de linhas" },
          ...fonteColunas.map((c) => ({ valor: `[${c}]`, label: `Coluna · ${c}` })),
          { valor: "[Count()]", label: "Quantidade de linhas (Count)" },
          { valor: "[Grupo]", label: "Valor do grupo (banda de grupo)" },
          { valor: "[Hoje]", label: "Data de hoje" },
          { valor: "[Pagina] de [Paginas]", label: "Página X de Y" },
        ]
      : [];

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold capitalize text-muted-foreground">{el.tipo}</p>

      {(el.tipo === "label" ||
        el.tipo === "campo" ||
        el.tipo === "paragrafo" ||
        el.tipo === "assinatura") && (
        <>
          <Campo label="Texto">
            <textarea
              rows={el.tipo === "paragrafo" ? 6 : 3}
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
        <ImagemElemento
          texto={el.texto}
          onTextoDigitando={(v) => upd({ texto: v }, false)}
          onTextoCommit={(v) => upd({ texto: v })}
        />
      )}

      {el.tipo === "tabela" && (
        <ColunasEditor
          colunas={el.colunas ?? []}
          onChange={(colunas) => upd({ colunas })}
          tokens={tokens}
        />
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
          <Campo label="Família de fonte">
            <Select
              value={el.estilo.fontFamily || "__inherit"}
              onValueChange={(v) =>
                updEstilo({ fontFamily: !v || v === "__inherit" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit">Herdar do documento</SelectItem>
                {/* Fonte selecionada mas não habilitada: mantém visível p/ não perder a escolha. */}
                {el.estilo.fontFamily &&
                  !fontesHabilitadas.some((f) => f.id === el.estilo.fontFamily) && (
                    <SelectItem value={el.estilo.fontFamily}>
                      {el.estilo.fontFamily} (desabilitada)
                    </SelectItem>
                  )}
                {fontesHabilitadas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
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

      {(el.tipo === "linha" || el.tipo === "retangulo") && (
        <Campo label="Estilo de linha">
          <Select
            value={el.estilo.borderStyle}
            onValueChange={(v) =>
              v &&
              updEstilo({
                borderStyle: v as "solida" | "tracejada" | "pontilhada",
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solida">Sólida</SelectItem>
              <SelectItem value="tracejada">Tracejada</SelectItem>
              <SelectItem value="pontilhada">Pontilhada</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
      )}

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

/** Editor de colunas do elemento tabela: adicionar/remover, título, campo (token), largura, alinhamento. */
function ColunasEditor({
  colunas,
  onChange,
  tokens,
}: {
  colunas: ColunaTabela[];
  onChange: (colunas: ColunaTabela[]) => void;
  tokens: { valor: string; label: string }[];
}) {
  const upd = (i: number, patch: Partial<ColunaTabela>) =>
    onChange(colunas.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(colunas.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([...colunas, { campo: "[Campo]", titulo: "Coluna", largura: 1, align: "left" }]);

  return (
    <div className="space-y-3 rounded-sm border p-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground">Colunas</p>
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="size-3.5" /> Adicionar
        </Button>
      </div>
      {colunas.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Sem colunas. Adicione ao menos uma.</p>
      )}
      {colunas.map((c, i) => (
        <div key={i} className="space-y-2 rounded-sm border bg-muted/30 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Coluna {i + 1}</span>
            <Button variant="ghost" size="icon" aria-label="Remover coluna" onClick={() => remove(i)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <Campo label="Título">
            <Input value={c.titulo} onChange={(e) => upd(i, { titulo: e.target.value })} />
          </Campo>
          <Campo label="Campo (token)">
            <Input
              value={c.campo}
              onChange={(e) => upd(i, { campo: e.target.value })}
              placeholder="[Campo]"
            />
          </Campo>
          {tokens.length > 0 && (
            <Campo label="Inserir campo">
              <Select value="" onValueChange={(v) => v && upd(i, { campo: v })}>
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
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Largura (peso)">
              <Input
                type="number"
                min={1}
                value={c.largura}
                onChange={(e) => upd(i, { largura: Math.max(1, Number(e.target.value) || 1) })}
              />
            </Campo>
            <Campo label="Alinhamento">
              <Select
                value={c.align}
                onValueChange={(v) =>
                  v && upd(i, { align: v as "left" | "center" | "right" })
                }
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
        </div>
      ))}
    </div>
  );
}

/** Bloco de imagem: caminho manual + upload (lib/storage) + miniatura. */
function ImagemElemento({
  texto,
  onTextoDigitando,
  onTextoCommit,
}: {
  texto: string;
  onTextoDigitando: (v: string) => void;
  onTextoCommit: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(file: File) {
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documentos/imagens", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(json.error ?? "Falha ao enviar a imagem.");
        return;
      }
      onTextoCommit(json.url);
      toast.success("Imagem enviada.");
    } catch {
      toast.error("Falha ao enviar a imagem.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-2">
      <Campo label="URL / caminho da imagem">
        <Input
          value={texto}
          onChange={(e) => onTextoDigitando(e.target.value)}
          onBlur={(e) => onTextoCommit(e.target.value)}
          placeholder="/MARCA/logo_completa_light.svg"
        />
      </Campo>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) enviar(f);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={enviando}
        onClick={() => inputRef.current?.click()}
      >
        {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {enviando ? "Enviando…" : "Enviar imagem"}
      </Button>
      {texto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={texto}
          alt="Pré-visualização"
          className="max-h-24 w-full rounded-sm border bg-muted object-contain p-1"
        />
      )}
      <p className="text-[11px] text-muted-foreground">PNG, JPG, WEBP ou SVG (máx 8 MB).</p>
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
