"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, ArrowUp, ArrowDown, Sparkles, Code } from "lucide-react";
import {
  salvarNomenclaturaGlobal,
  salvarNomenclaturaProjeto,
  limparNomenclaturaProjeto,
} from "@/modules/projetos/nomenclatura/actions";
import {
  CAMPOS_PADRAO,
  LABEL_CAMPO,
  TEXTO_FIXO_VALIDO,
  rotuloBloco,
  interpretarModeloVisual,
  montarModelo,
  exemploNomeModelo,
  type BlocoModelo,
  type CampoPadrao,
} from "@/modules/uploads/nomenclatura/padrao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PLACEHOLDER = "vazio = padrão embutido {proj}-{disc}-{fase}-{nº}-{tipo}";

/** Ponto de partida do editor visual quando não há padrão nenhum — o mesmo formato que o
 *  padrão embutido já usa, só explicitado. Sem bloco de revisão: desde 2026-09-16 quem
 *  versiona é o HUB (Upload.versao/DocumentoRevisao), não mais o `-Rnn` no nome do arquivo —
 *  um nome com `-Rnn` continua validando (o compilador tolera o sufixo mesmo sem o campo),
 *  só não é mais o que a oficina orienta a digitar. */
const BLOCOS_PADRAO_OFICINA: BlocoModelo[] = [
  { campo: "proj", opcional: false },
  { campo: "disc", opcional: false },
  { campo: "fase", opcional: false },
  { campo: "num", opcional: false },
  { campo: "tipo", opcional: false },
];

const SEPARADORES = [
  { valor: "-", rotulo: "traço ( - )" },
  { valor: "_", rotulo: "underline ( _ )" },
  { valor: ".", rotulo: "ponto ( . )" },
  { valor: " ", rotulo: "espaço" },
];

/** Estado inicial do editor visual a partir do padrão salvo — parseia se der, senão sugere o
 *  ponto de partida da oficina (o usuário decide se aceita ou mexe). */
function blocosIniciais(padrao: string): { blocos: BlocoModelo[]; separador: string } {
  const interpretado = interpretarModeloVisual(padrao);
  if (interpretado) return interpretado;
  return { blocos: BLOCOS_PADRAO_OFICINA, separador: "-" };
}

export function NomenclaturaForm({
  escopo,
  inicial,
  global,
}: {
  escopo: "global" | { projetoId: string };
  inicial: { exigir: boolean; exigirFase: boolean; padrao: string; definido?: boolean };
  global?: { exigir: boolean; exigirFase: boolean; padrao: string };
}) {
  const router = useRouter();
  const [exigir, setExigir] = useState(inicial.exigir);
  const [exigirFase, setExigirFase] = useState(inicial.exigirFase);
  // Modo avançado só nasce ligado quando o padrão salvo é uma escrita que o editor visual não
  // representa (regex legada, ou modelo com `R{rev}`/separador irregular) — nunca por padrão.
  const representavel = inicial.padrao.trim() === "" || interpretarModeloVisual(inicial.padrao) !== null;
  const [modoAvancado, setModoAvancado] = useState(!representavel);
  const [textoAvancado, setTextoAvancado] = useState(inicial.padrao);
  const [visual, setVisual] = useState(() => blocosIniciais(inicial.padrao));
  // Só um clique de EDIÇÃO de bloco liga isto — nunca abrir a seção, nem só espiar o editor
  // visual. Sem essa distinção, salvar sem mexer em nada escreveria o padrão da oficina como
  // se fosse escolha da pessoa, e um projeto que HERDAVA o global passaria a ter padrão
  // próprio (e um matcher ligeiramente diferente do embutido) só por ter aberto a seção.
  const [visualTocado, setVisualTocado] = useState(false);
  const [pending, start] = useTransition();
  const isProjeto = escopo !== "global";

  // Fonte única enviada ao servidor. Sem toque no editor visual, manda o padrão ORIGINAL
  // (mesmo vazio) — nunca o que o editor está mostrando só pra ilustrar. Com toque, manda o
  // modelo montado. Modo avançado sempre manda o texto (é edição direta, sem estado derivado).
  const padraoEfetivo = modoAvancado ? textoAvancado : visualTocado ? montarModelo(visual.blocos, visual.separador) : inicial.padrao;
  const exemplo = visual.blocos.length > 0 ? exemploNomeModelo(visual.blocos, visual.separador) : "";

  function irParaVisual() {
    const base = modoAvancado ? textoAvancado : padraoEfetivo;
    const interpretado = base.trim() === "" ? { blocos: BLOCOS_PADRAO_OFICINA, separador: "-" } : interpretarModeloVisual(base);
    if (!interpretado) {
      toast.error("Este padrão usa uma escrita que o editor visual não representa (ex.: regex, ou \"R{rev}\"). Ajuste no modo avançado, ou comece do zero abaixo.");
      return;
    }
    setVisual(interpretado);
    setModoAvancado(false);
    // Só conta como "mexeu" se o texto vinha de uma edição de verdade no avançado (diferente do
    // que estava salvo) — só olhar o editor visual sem escrever nada não pode virar gravação.
    if (base.trim() !== inicial.padrao.trim()) setVisualTocado(true);
  }

  function comecarDoZero() {
    setVisual({ blocos: BLOCOS_PADRAO_OFICINA, separador: "-" });
    setModoAvancado(false);
    // NÃO marca tocado: "recomeçar do zero" só troca o que a tela MOSTRA como sugestão. Só
    // mexer de fato num bloco (adicionar/remover/reordenar/opcional/separador) é que vira
    // escolha de padrão próprio — abrir a seção ou clicar aqui não grava nada sozinho.
  }

  function alternarCampo(campo: CampoPadrao) {
    setVisual((v) => {
      const jaTem = v.blocos.some((b) => b.campo === campo);
      return { ...v, blocos: jaTem ? v.blocos.filter((b) => b.campo !== campo) : [...v.blocos, { campo, opcional: false }] };
    });
    setVisualTocado(true);
  }

  // Por POSIÇÃO, não por campo: bloco de texto fixo (`SENA`, padrão v2) pode se repetir e não
  // tem campo próprio para servir de chave.
  function alternarOpcional(indice: number) {
    setVisual((v) => ({
      ...v,
      blocos: v.blocos.map((b, i) => (i === indice && b.campo !== "texto" ? { ...b, opcional: !b.opcional } : b)),
    }));
    setVisualTocado(true);
  }

  function remover(indice: number) {
    setVisual((v) => ({ ...v, blocos: v.blocos.filter((_, i) => i !== indice) }));
    setVisualTocado(true);
  }

  const [textoFixo, setTextoFixo] = useState("");
  const textoFixoValido = TEXTO_FIXO_VALIDO.test(textoFixo.trim());
  function adicionarTextoFixo() {
    const texto = textoFixo.trim().toUpperCase();
    if (!TEXTO_FIXO_VALIDO.test(texto)) return;
    setVisual((v) => ({ ...v, blocos: [...v.blocos, { campo: "texto", texto, opcional: false }] }));
    setTextoFixo("");
    setVisualTocado(true);
  }

  function mover(i: number, direcao: -1 | 1) {
    setVisual((v) => {
      const j = i + direcao;
      if (j < 0 || j >= v.blocos.length) return v;
      const blocos = [...v.blocos];
      [blocos[i], blocos[j]] = [blocos[j], blocos[i]];
      return { ...v, blocos };
    });
    setVisualTocado(true);
  }

  function salvar() {
    start(async () => {
      const r = isProjeto
        ? await salvarNomenclaturaProjeto({ projetoId: escopo.projetoId, exigir, exigirFase, padrao: padraoEfetivo || undefined })
        : await salvarNomenclaturaGlobal({ exigir, exigirFase, padrao: padraoEfetivo || undefined });
      if (r.ok) {
        toast.success("Nomenclatura salva.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function limpar() {
    if (!isProjeto) return;
    start(async () => {
      const r = await limparNomenclaturaProjeto({ projetoId: escopo.projetoId });
      if (r.ok) {
        toast.success("Voltou a herdar a configuração global.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3 rounded-sm border p-3">
      <div>
        <p className="text-sm font-semibold">Nomenclatura padrão (pacote A)</p>
        <p className="text-xs text-muted-foreground">
          Quando exigida, arquivos de Pranchas fora do padrão recebem um alerta na lista.
          {isProjeto && global && (
            <>
              {" "}Global: <span className="font-medium">{global.exigir ? "exige" : "livre"}</span>, fase {global.exigirFase ? "obrigatória" : "opcional"}.
              {" "}{inicial.definido
                ? "Este projeto possui configuração própria."
                : "Este projeto herda a configuração global."}
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={exigir ? "secondary" : "outline"} onClick={() => setExigir((v) => !v)}>
          {exigir ? "Exige padrão" : "Nomenclatura livre"}
        </Button>
        <Button type="button" size="sm" variant={exigirFase ? "secondary" : "outline"} onClick={() => setExigirFase((v) => !v)}>
          {exigirFase ? "Exige fases" : "Fase opcional"}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="sm" variant={!modoAvancado ? "secondary" : "ghost"} onClick={irParaVisual}>
            <Sparkles className="size-3.5" /> Editor visual
          </Button>
          <Button type="button" size="sm" variant={modoAvancado ? "secondary" : "ghost"} onClick={() => setModoAvancado(true)}>
            <Code className="size-3.5" /> Avançado (texto)
          </Button>
        </div>
      </div>

      {modoAvancado ? (
        <div className="space-y-1">
          <Label className="text-xs">Padrão custom (regex ou modelo, opcional)</Label>
          <Input
            value={textoAvancado}
            onChange={(e) => setTextoAvancado(e.target.value)}
            placeholder={PLACEHOLDER}
            className="font-mono text-xs"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Blocos do nome (clique para adicionar ou remover)</Label>
            <div className="flex flex-wrap gap-1.5">
              {CAMPOS_PADRAO.map((campo) => {
                const selecionado = visual.blocos.some((b) => b.campo === campo);
                return (
                  <Button
                    key={campo}
                    type="button"
                    size="sm"
                    variant={selecionado ? "secondary" : "outline"}
                    onClick={() => alternarCampo(campo)}
                  >
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
              <Button type="button" size="sm" variant="outline" disabled={!textoFixoValido} onClick={adicionarTextoFixo}>
                Adicionar texto fixo
              </Button>
            </div>
            {textoFixo.trim() !== "" && !textoFixoValido && (
              <p className="text-[11px] text-destructive">Só letras e números, sem acento, espaço ou separador.</p>
            )}
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
                        <Checkbox checked={b.opcional} onCheckedChange={() => alternarOpcional(i)} />
                        opcional
                      </label>
                    )}
                    <div className="ml-auto flex items-center gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        disabled={i === 0}
                        onClick={() => mover(i, -1)}
                        aria-label={`Mover ${rotuloBloco(b)} para cima`}
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        disabled={i === visual.blocos.length - 1}
                        onClick={() => mover(i, 1)}
                        aria-label={`Mover ${rotuloBloco(b)} para baixo`}
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        onClick={() => remover(i)}
                        aria-label={`Remover ${rotuloBloco(b)}`}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Label className="text-xs">Separador</Label>
                <Select
                  value={visual.separador}
                  onValueChange={(v) => {
                    if (!v) return;
                    setVisual((s) => ({ ...s, separador: v }));
                    setVisualTocado(true);
                  }}
                >
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEPARADORES.map((s) => (
                      <SelectItem key={s.valor} value={s.valor}>{s.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-sm bg-muted/50 p-2 text-xs">
                <span className="text-muted-foreground">Assim ficaria: </span>
                <span className="font-mono">{exemplo}</span>
                {visual.blocos.some((b) => b.opcional) && (
                  <span className="text-muted-foreground">
                    {" "}· opcional: {visual.blocos.filter((b) => b.opcional).map(rotuloBloco).join(", ")}
                  </span>
                )}
              </div>
            </div>
          )}

          {visual.blocos.length === 0 && (
            <p className="text-xs text-muted-foreground">Escolha ao menos um bloco para montar o padrão.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={salvar} disabled={pending || (!modoAvancado && visual.blocos.length === 0)}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        {isProjeto && inicial.definido && (
          <Button size="sm" variant="ghost" onClick={limpar} disabled={pending}>
            Voltar ao global
          </Button>
        )}
        {!modoAvancado && (
          <Button type="button" size="sm" variant="link" className="text-xs text-muted-foreground" onClick={comecarDoZero}>
            Recomeçar do zero
          </Button>
        )}
        {!representavel && modoAvancado && (
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-xs text-warning">
            Escrita que o editor visual não representa
          </Badge>
        )}
      </div>
    </div>
  );
}
