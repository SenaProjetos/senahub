"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motivoCodigoTravado } from "@/modules/projetos/cadastro-disciplina";
import { valeNaVersao } from "@/modules/uploads/nomenclatura/siglas-versao";
import { SeletorIcone } from "./seletor-icone";

/** O que o lápis do card edita: nada de versão, sigla ou sinônimo (spec 2026-09-30, E9). */
export type CadastroCardEditavel = {
  id: string;
  nome: string;
  categoria: string | null;
  codigo: string | null;
  icone: string | null;
  iconeSvg: string | null;
  numeracao: number | null;
  numeracaoFim: number | null;
  /** Projetos que usam a disciplina — trava a pasta dos arquivos. */
  uso: number;
  /** Validade do card, para saber se alguma versão em que ele vale numera por faixa. */
  versaoDesde: number;
  versaoAte: number | null;
};

export type PayloadCadastroCard = {
  id: string;
  nome: string;
  categoria?: string;
  codigo?: string;
  icone?: string;
  iconeSvg?: string;
  numeracao: number | null;
  numeracaoFim: number | null;
};

export function EditarCardDialog({
  card,
  categorias,
  versoes,
  pending,
  onSalvar,
  onFechar,
}: {
  card: CadastroCardEditavel;
  categorias: string[];
  versoes: readonly { numero: number; sequenciaPor: string }[];
  pending: boolean;
  onSalvar: (p: PayloadCadastroCard) => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(card.nome);
  const [categoria, setCategoria] = useState(card.categoria ?? "");
  const [codigo, setCodigo] = useState(card.codigo ?? "");
  const [icone, setIcone] = useState<{ icone: string | null; iconeSvg: string | null }>({ icone: card.icone, iconeSvg: card.iconeSvg });
  const [numeracao, setNumeracao] = useState(card.numeracao != null ? String(card.numeracao) : "");
  const [numeracaoFim, setNumeracaoFim] = useState(card.numeracaoFim != null ? String(card.numeracaoFim) : "");

  const travado = motivoCodigoTravado(card.uso);
  // Numeração por faixa (4000–4999) só existe nas versões numeradas por faixa (a v1). Card que só
  // vale em versões que recomeçam a numeração por sub não usa — o campo só confundia.
  const usaFaixa =
    versoes.length === 0 ||
    versoes.some((v) => v.sequenciaPor === "faixa" && valeNaVersao({ versaoDesde: card.versaoDesde, versaoAte: card.versaoAte }, v.numero)) ||
    numeracao.trim() !== "" ||
    numeracaoFim.trim() !== "";

  function salvar() {
    const num = (t: string) => (t.trim() === "" ? null : Number(t));
    onSalvar({
      id: card.id,
      nome: nome.trim(),
      categoria: categoria.trim() || undefined,
      // Travado: manda a pasta como está (a action só recusa quando ela MUDA).
      codigo: (travado ? (card.codigo ?? "") : codigo.trim()) || undefined,
      icone: icone.icone ?? undefined,
      iconeSvg: icone.iconeSvg ?? undefined,
      numeracao: num(numeracao),
      numeracaoFim: num(numeracaoFim),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar cadastro — {card.nome}</DialogTitle>
          <DialogDescription>Vale para todas as versões. Sigla e o que entra em cada versão mudam dentro da versão.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cadastro-nome">Nome</Label>
            <Input id="cadastro-nome" value={nome} autoFocus onChange={(e) => setNome(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cadastro-categoria">Categoria</Label>
            <Input
              id="cadastro-categoria"
              list="cadastro-categorias"
              value={categoria}
              placeholder="CIVIL, ELÉTRICA…"
              onChange={(e) => setCategoria(e.target.value)}
            />
            <datalist id="cadastro-categorias">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {categorias.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {categorias.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="xs"
                    variant={categoria.trim() === c ? "secondary" : "outline"}
                    aria-pressed={categoria.trim() === c}
                    className="h-6 text-[11px]"
                    onClick={() => setCategoria(categoria.trim() === c ? "" : c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Digite um nome novo para criar uma categoria; em branco, a disciplina fica em “Outras”.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cadastro-pasta">Pasta dos arquivos</Label>
            {travado ? (
              <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm" id="cadastro-pasta">
                <Lock className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="font-mono font-semibold">{card.codigo ?? "—"}</span>
              </div>
            ) : (
              <Input
                id="cadastro-pasta"
                value={codigo}
                maxLength={6}
                placeholder="ELE"
                className="font-mono uppercase"
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              Nome da pasta e prefixo dos arquivos no servidor — não é a sigla do nome do arquivo.{" "}
              {travado ? (
                <>
                  <strong className="font-semibold text-foreground">{travado}</strong> Só dá para mudar enquanto nenhum projeto usa a
                  disciplina.
                </>
              ) : (
                "Pode mudar porque nenhum projeto usa esta disciplina ainda."
              )}
            </p>
          </div>

          {usaFaixa && (
            <div className="space-y-1.5">
              <Label>
                Numeração por faixa <span className="font-normal text-muted-foreground">(só nas versões que numeram por faixa)</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cadastro-num-ini" className="text-xs text-muted-foreground">
                    Início
                  </Label>
                  <Input
                    id="cadastro-num-ini"
                    type="number"
                    min={0}
                    value={numeracao}
                    placeholder="4000"
                    className="font-mono tabular-nums"
                    onChange={(e) => setNumeracao(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cadastro-num-fim" className="text-xs text-muted-foreground">
                    Fim
                  </Label>
                  <Input
                    id="cadastro-num-fim"
                    type="number"
                    min={0}
                    value={numeracaoFim}
                    placeholder="4999"
                    className="font-mono tabular-nums"
                    onChange={(e) => setNumeracaoFim(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Bloco na nomenclatura (ex.: 4000–4999 → folhas 4001, 4002…). Sem o fim da faixa, o envio não reconhece a disciplina só
                pelo número do arquivo.
              </p>
            </div>
          )}

          <SeletorIcone nome={nome} icone={icone.icone} iconeSvg={icone.iconeSvg} onChange={setIcone} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || nome.trim().length < 2}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lápis de sub-disciplina, fase ou tipo: só o nome (sigla e validade são da lente de uma versão). */
export function EditarNomeDialog({
  titulo,
  nome: inicial,
  pending,
  onSalvar,
  onFechar,
}: {
  titulo: string;
  nome: string;
  pending: boolean;
  onSalvar: (nome: string) => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(inicial);
  const limpo = nome.trim();
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Vale para todas as versões. Sigla e o que entra em cada versão mudam dentro da versão.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cadastro-nome-simples">Nome</Label>
          <Input
            id="cadastro-nome-simples"
            value={nome}
            autoFocus
            maxLength={80}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && limpo && limpo !== inicial) onSalvar(limpo);
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => onSalvar(limpo)} disabled={pending || !limpo || limpo === inicial}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
