"use client";

import Link from "next/link";
import { useState } from "react";
import type { Dia } from "@/lib/calendario-trabalho";
import type { BarraDoPlanejador } from "@/modules/planejamento/planejador-equipe";
import {
  MOTIVO_SEM_PERMISSAO_NO_PROJETO,
  motivoParaNaoMoverData,
  motivoParaNaoTrocarPessoa,
  textoDasSeguintes,
  type EdicaoDoProjeto,
  type SeguintesDaBarra,
} from "@/modules/planejamento/planejador-acoes";
import { dataCurta } from "@/lib/dias-iso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** A mudança que o arrasto (ou o painel da barra) pediu e a confirmação mostra antes de gravar. */
export type MudancaPendente =
  | { tipo: "data"; barra: BarraDoPlanejador; inicio: Dia }
  | { tipo: "pessoa"; barra: BarraDoPlanejador; de: { userId: string; nome: string } | null; para: { userId: string; nome: string } };

const horasTxt = (h: number) => `${String(Math.round(h * 10) / 10).replace(".", ",")} h`;
const periodo = (b: Pick<BarraDoPlanejador, "inicio" | "fim">) => (b.inicio === b.fim ? dataCurta(b.inicio) : `${dataCurta(b.inicio)} a ${dataCurta(b.fim)}`);

/**
 * O painel que abre ao clicar (ou tocar, ou Enter) numa barra da tela por pessoa: o que é a tarefa, o link para o
 * cronograma e, para quem monta cronograma, mudar o início e trocar a pessoa — o caminho de teclado e de toque do arrasto.
 * O que não pode aparece com o motivo (a mesma frase do arrasto e do servidor).
 */
export function PainelDaBarra({
  barra,
  pessoa,
  edicao,
  pessoas,
  onMudar,
}: {
  barra: BarraDoPlanejador;
  /** Dono da faixa (`null` = faixa "sem ninguém"). */
  pessoa: { userId: string; nome: string } | null;
  /** `undefined` = quem olha não monta cronograma (só leitura). */
  edicao: EdicaoDoProjeto | undefined;
  pessoas: readonly { userId: string; nome: string }[];
  onMudar: (m: MudancaPendente) => void;
}) {
  const [inicio, setInicio] = useState(barra.inicio);
  const [para, setPara] = useState<string | null>(null);
  const motivoData = edicao ? motivoParaNaoMoverData(edicao, barra) : null;
  const opcoes = pessoas.filter((p) => !barra.pessoasDaLinha.includes(p.userId));
  const idBase = `barra-${barra.chave.replace(/[^a-zA-Z0-9-]/g, "")}`;

  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="space-y-0.5">
        <p className="font-semibold">
          {barra.marco && "◆ "}
          {barra.codigoProjeto} · {barra.nome}
        </p>
        <p className="text-xs text-muted-foreground">
          {barra.rascunho ? "Rascunho" : "Aprovado"} · {periodo(barra)}
          {pessoa && barra.horas > 0 ? ` · ${horasTxt(barra.horas)} de ${pessoa.nome}` : ""}
          {barra.disciplina ? ` · ${barra.disciplina}` : ""}
        </p>
        <Link
          href={`/planejamento/${barra.projetoId}`}
          aria-label={`Abrir o cronograma do ${barra.codigoProjeto}`}
          className="text-xs text-primary underline underline-offset-[3px]"
        >
          Abrir o cronograma
        </Link>
      </div>

      {edicao && !edicao.editavel && <p className="text-xs text-muted-foreground">{MOTIVO_SEM_PERMISSAO_NO_PROJETO}</p>}

      {edicao?.editavel && (
        <>
          <div className="space-y-1.5 border-t pt-3">
            <Label htmlFor={`${idBase}-inicio`}>Início</Label>
            {motivoData ? (
              <p className="text-xs text-muted-foreground">{motivoData}</p>
            ) : (
              <div className="flex gap-2">
                <Input
                  id={`${idBase}-inicio`}
                  type="date"
                  className="w-40"
                  value={inicio}
                  aria-describedby={`${idBase}-dica`}
                  onChange={(e) => setInicio(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Mover o início de ${barra.nome}`}
                  disabled={!inicio || inicio === barra.inicio}
                  onClick={() => onMudar({ tipo: "data", barra, inicio })}
                >
                  Mover
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1.5 border-t pt-3">
            <Label htmlFor={`${idBase}-pessoa`}>{pessoa ? `Trocar ${pessoa.nome} por` : "Atribuir a"}</Label>
            {opcoes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ninguém mais para escolher.</p>
            ) : (
              <div className="flex gap-2">
                <Select value={para} onValueChange={setPara}>
                  <SelectTrigger id={`${idBase}-pessoa`} className="h-8 w-48" aria-describedby={`${idBase}-dica`}>
                    <SelectValue placeholder="Escolha a pessoa">{opcoes.find((p) => p.userId === para)?.nome}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {opcoes.map((p) => (
                      <SelectItem key={p.userId} value={p.userId}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={pessoa ? `Trocar a pessoa de ${barra.nome}` : `Atribuir ${barra.nome}`}
                  disabled={!para || motivoParaNaoTrocarPessoa(edicao, barra.pessoasDaLinha, para) != null}
                  onClick={() => {
                    const alvo = opcoes.find((p) => p.userId === para);
                    if (alvo) onMudar({ tipo: "pessoa", barra, de: pessoa, para: alvo });
                  }}
                >
                  {pessoa ? "Trocar" : "Atribuir"}
                </Button>
              </div>
            )}
          </div>
          <p id={`${idBase}-dica`} className="text-xs text-muted-foreground pointer-coarse:hidden">
            Com o mouse, também dá para arrastar a barra: para o lado muda o início; para a faixa de outra pessoa, troca a pessoa.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * A confirmação de toda mudança pelo arrasto (decisão H): o que muda, as seguintes ("Mover também as seguintes?" quando
 * alguma tem data fixada), a revisão aberta e o aviso à coordenação de quem não coordena o projeto (decisão 4).
 */
export function ConfirmarMudancaDialog({
  mudanca,
  edicao,
  seguintes,
  pendente,
  onConfirmar,
  onCancelar,
}: {
  mudanca: MudancaPendente | null;
  edicao: EdicaoDoProjeto | undefined;
  seguintes: SeguintesDaBarra | undefined;
  pendente: boolean;
  onConfirmar: (moverSeguintes: boolean) => void;
  onCancelar: () => void;
}) {
  const b = mudanca?.barra;
  const tarefa = b ? `"${b.codigoProjeto} · ${b.nome}"` : "";
  const avisaCoordenacao = edicao ? !edicao.souCoordenador : false;
  const fixadas = mudanca?.tipo === "data" ? (seguintes?.fixadas ?? 0) : 0;

  let titulo = "";
  let descricao = "";
  const itens: string[] = [];
  if (mudanca?.tipo === "data" && b) {
    titulo = fixadas > 0 && seguintes ? `Mover também ${textoDasSeguintes(seguintes)}?` : "Mover a tarefa?";
    descricao = `${tarefa} passa a começar em ${dataCurta(mudanca.inicio)} (hoje começa em ${dataCurta(b.inicio)}).`;
    if (seguintes && seguintes.total > 0) {
      itens.push(`${textoDasSeguintes(seguintes)} ${seguintes.total === 1 ? "depende dela e anda" : "dependem dela e andam"} junto pelo vínculo.`);
    }
    if (fixadas > 0) {
      itens.push(
        `${fixadas === 1 ? "Uma das seguintes tem" : `${fixadas} das seguintes têm`} data fixada: "Mover também as seguintes" leva ${fixadas === 1 ? "essa data" : "essas datas"} os mesmos dias úteis; "Só esta tarefa" ${fixadas === 1 ? "deixa a data" : "deixa as datas"} onde está.`,
      );
    }
    itens.push("As predecessoras são respeitadas: se uma delas termina depois, a tarefa começa quando ela terminar.");
    if (edicao?.emRevisao) itens.push("O cronograma está em revisão: a mudança entra na nova linha de base, com o motivo.");
  } else if (mudanca?.tipo === "pessoa" && b) {
    titulo = mudanca.de ? "Trocar a pessoa?" : "Atribuir a tarefa?";
    descricao = mudanca.de
      ? `${mudanca.de.nome} sai e ${mudanca.para.nome} entra em ${tarefa}.`
      : `${mudanca.para.nome} passa a fazer ${tarefa}.`;
    itens.push(
      mudanca.de
        ? "As horas automáticas são recalculadas pela jornada e pela dedicação de quem entra; horas digitadas vão junto."
        : "As horas são preenchidas pela duração, como ao atribuir na EAP.",
    );
    if (!b.rascunho) itens.push("Trocar a pessoa não precisa de revisão e não muda a linha de base.");
  }
  if (avisaCoordenacao) itens.push("Você não coordena este projeto: a coordenação dele vai ser avisada.");

  return (
    <Dialog open={mudanca != null} onOpenChange={(o) => !o && !pendente && onCancelar()}>
      <DialogContent className="sm:max-w-md" aria-busy={pendente}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        {itens.length > 0 && (
          <DialogBody>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {itens.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={pendente}>
            Cancelar
          </Button>
          {fixadas > 0 ? (
            <>
              <Button variant="outline" onClick={() => onConfirmar(false)} disabled={pendente}>
                Só esta tarefa
              </Button>
              <Button onClick={() => onConfirmar(true)} disabled={pendente}>
                Mover também as seguintes
              </Button>
            </>
          ) : (
            <Button onClick={() => onConfirmar(false)} disabled={pendente}>
              {pendente ? "Gravando…" : mudanca?.tipo === "pessoa" ? (mudanca.de ? "Trocar" : "Atribuir") : "Mover"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
