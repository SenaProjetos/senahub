"use client";

import { useState } from "react";
import { X, ArrowUp, ArrowDown, Sparkles, Code } from "lucide-react";
import {
  CAMPOS_PADRAO,
  LABEL_CAMPO,
  TEXTO_FIXO_VALIDO,
  compilarPadrao,
  ehModelo,
  exemploNomeModelo,
  interpretarModeloVisual,
  montarModelo,
  rotuloBloco,
  type BlocoModelo,
  type CampoPadrao,
} from "@/modules/uploads/nomenclatura/padrao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEPARADORES = [
  { valor: "-", rotulo: "Traço (-)" },
  { valor: "_", rotulo: "Sublinhado (_)" },
  { valor: ".", rotulo: "Ponto (.)" },
];

/**
 * Editor visual do modelo de nome — usado na tela de versões (`/configuracoes/nomenclatura`).
 * Controlado: recebe o modelo atual e devolve o novo a cada mudança de bloco/separador/texto.
 * Modelo que não é representável como blocos (regex legada, campo repetido…) cai direto no modo
 * avançado, igual ao editor do padrão por projeto.
 */
export function EditorModeloNome({ modelo, onChange }: { modelo: string; onChange: (modelo: string) => void }) {
  const interpretadoInicial = modelo.trim() === "" ? null : interpretarModeloVisual(modelo);
  const [modoAvancado, setModoAvancado] = useState(modelo.trim() !== "" && interpretadoInicial === null);
  const [visual, setVisual] = useState<{ blocos: BlocoModelo[]; separador: string }>(
    interpretadoInicial ?? { blocos: [], separador: "-" },
  );
  const [textoFixo, setTextoFixo] = useState("");

  function atualizarVisual(novo: { blocos: BlocoModelo[]; separador: string }) {
    setVisual(novo);
    onChange(montarModelo(novo.blocos, novo.separador));
  }

  function alternarCampo(campo: CampoPadrao) {
    const jaTem = visual.blocos.some((b) => b.campo === campo);
    atualizarVisual({
      ...visual,
      blocos: jaTem ? visual.blocos.filter((b) => b.campo !== campo) : [...visual.blocos, { campo, opcional: false }],
    });
  }

  function alternarOpcional(indice: number) {
    atualizarVisual({
      ...visual,
      blocos: visual.blocos.map((b, i) => (i === indice && b.campo !== "texto" ? { ...b, opcional: !b.opcional } : b)),
    });
  }

  function remover(indice: number) {
    atualizarVisual({ ...visual, blocos: visual.blocos.filter((_, i) => i !== indice) });
  }

  function mover(i: number, direcao: -1 | 1) {
    const j = i + direcao;
    if (j < 0 || j >= visual.blocos.length) return;
    const blocos = [...visual.blocos];
    [blocos[i], blocos[j]] = [blocos[j], blocos[i]];
    atualizarVisual({ ...visual, blocos });
  }

  function adicionarTextoFixo() {
    const texto = textoFixo.trim().toUpperCase();
    if (!TEXTO_FIXO_VALIDO.test(texto)) return;
    atualizarVisual({ ...visual, blocos: [...visual.blocos, { campo: "texto", texto, opcional: false }] });
    setTextoFixo("");
  }

  const exemplo = visual.blocos.length > 0 ? exemploNomeModelo(visual.blocos, visual.separador) : "";
  const modeloInvalido = modoAvancado && modelo.trim() !== "" && !compilarPadrao(modelo);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          size="sm"
          variant={!modoAvancado ? "secondary" : "ghost"}
          onClick={() => {
            setModoAvancado(false);
            const interpretado = ehModelo(modelo) ? interpretarModeloVisual(modelo) : null;
            if (interpretado) setVisual(interpretado);
          }}
        >
          <Sparkles className="size-3.5" /> Editor visual
        </Button>
        <Button type="button" size="sm" variant={modoAvancado ? "secondary" : "ghost"} onClick={() => setModoAvancado(true)}>
          <Code className="size-3.5" /> Avançado (texto)
        </Button>
      </div>

      {modoAvancado ? (
        <div className="space-y-1">
          <Label className="text-xs">Modelo (ex.: {"{proj}"}-SENA-{"{disc}"}-{"{fase}"}-{"{num}"}-{"{tipo}"})</Label>
          <Input value={modelo} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
          {modeloInvalido && <p className="text-[11px] text-destructive">Modelo inválido.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Blocos do nome (clique para adicionar ou remover)</Label>
            <div className="flex flex-wrap gap-1.5">
              {CAMPOS_PADRAO.map((campo) => {
                const selecionado = visual.blocos.some((b) => b.campo === campo);
                return (
                  <Button key={campo} type="button" size="sm" variant={selecionado ? "secondary" : "outline"} onClick={() => alternarCampo(campo)}>
                    {LABEL_CAMPO[campo]}
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <Input
                value={textoFixo}
                onChange={(e) => setTextoFixo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarTextoFixo();
                  }
                }}
                placeholder="Texto fixo (ex.: SENA)"
                aria-label="Texto fixo do nome"
                className="h-8 w-44 text-xs"
              />
              <Button type="button" size="sm" variant="outline" disabled={!TEXTO_FIXO_VALIDO.test(textoFixo.trim())} onClick={adicionarTextoFixo}>
                Adicionar texto fixo
              </Button>
            </div>
          </div>

          {visual.blocos.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Ordem, obrigatoriedade e separador</Label>
              <div className="divide-y rounded-sm border">
                {visual.blocos.map((b, i) => (
                  <div key={b.campo === "texto" ? `texto-${i}` : b.campo} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="w-24 shrink-0 text-sm">{rotuloBloco(b)}</span>
                    {b.campo === "texto" ? (
                      <span className="text-xs text-muted-foreground">texto fixo</span>
                    ) : (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox checked={b.opcional} onCheckedChange={() => alternarOpcional(i)} /> opcional
                      </label>
                    )}
                    <div className="ml-auto flex items-center gap-0.5">
                      <Button type="button" size="icon" variant="ghost" className="size-6" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Mover ${rotuloBloco(b)} para cima`}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="size-6" disabled={i === visual.blocos.length - 1} onClick={() => mover(i, 1)} aria-label={`Mover ${rotuloBloco(b)} para baixo`}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="size-6 text-muted-foreground hover:text-destructive" onClick={() => remover(i)} aria-label={`Remover ${rotuloBloco(b)}`}>
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Label className="text-xs">Separador</Label>
                <Select value={visual.separador} onValueChange={(v) => v && atualizarVisual({ ...visual, separador: v })}>
                  <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEPARADORES.map((s) => <SelectItem key={s.valor} value={s.valor}>{s.rotulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-sm bg-muted/50 p-2 text-xs">
                <span className="text-muted-foreground">Assim ficaria: </span>
                <span className="font-mono">{exemplo}</span>
              </div>
            </div>
          )}

          {visual.blocos.length === 0 && <p className="text-xs text-muted-foreground">Escolha ao menos um bloco para montar o modelo.</p>}
        </div>
      )}
    </div>
  );
}
