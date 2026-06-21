"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Referência das variáveis/tokens suportados nos textos dos elementos.
 * As descrições derivam diretamente do motor em src/modules/documentos/tokens.ts
 * (resolverToken/formatar) e das fontes em fontes-meta.ts.
 */

type Token = { sintaxe: string; descricao: string; exemplo?: string };

const ESTRUTURA: Token[] = [
  {
    sintaxe: "[Campo]",
    descricao:
      "Valor de um campo da fonte de dados. Na banda de detalhe usa a linha atual; fora dela usa o valor escalar.",
    exemplo: "[Nome] · [Total]",
  },
  {
    sintaxe: "[Fonte.Campo]",
    descricao:
      "Equivalente a [Campo], mas com o prefixo da fonte. O motor tenta o caminho completo e, se não achar, usa só o nome final do campo.",
    exemplo: "[Cliente.Nome]",
  },
];

const AGREGADOS: Token[] = [
  {
    sintaxe: "[Sum(Campo)]",
    descricao: "Soma os valores numéricos do campo em todas as linhas da coleção.",
    exemplo: "[Sum(Valor):c2]",
  },
  {
    sintaxe: "[Count()]",
    descricao: "Quantidade de linhas da coleção (ignora o argumento).",
    exemplo: "[Count()] itens",
  },
  {
    sintaxe: "[Avg(Campo)]",
    descricao: "Média aritmética dos valores numéricos do campo.",
    exemplo: "[Avg(Valor):c2]",
  },
  {
    sintaxe: "[Min(Campo)]",
    descricao: "Menor valor numérico do campo na coleção.",
    exemplo: "[Min(Valor):c2]",
  },
  {
    sintaxe: "[Max(Campo)]",
    descricao: "Maior valor numérico do campo na coleção.",
    exemplo: "[Max(Valor):c2]",
  },
];

const ESPECIAIS: Token[] = [
  {
    sintaxe: "[Hoje]",
    descricao: "Data atual, já formatada em pt-BR (dd/mm/aaaa) por padrão.",
    exemplo: "Emitido em [Hoje]",
  },
  {
    sintaxe: "[Pagina]",
    descricao: "Número da página atual. Só pode ser inserido em bandas de rodapé (rodapé de página / rodapé do relatório), não no corpo.",
    exemplo: "[Pagina] de [Paginas]",
  },
  {
    sintaxe: "[Paginas]",
    descricao: "Total de páginas. Disponível apenas nas bandas de rodapé.",
  },
];

const FORMATOS: Token[] = [
  {
    sintaxe: ":c2",
    descricao: "Moeda (BRL). O número após o c define as casas decimais — :c2 usa 2 casas.",
    exemplo: "[Total:c2] → R$ 1.234,50",
  },
  {
    sintaxe: ":d",
    descricao: "Data no formato pt-BR (dd/mm/aaaa).",
    exemplo: "[Prazo:d] → 20/06/2026",
  },
  {
    sintaxe: ":p1",
    descricao:
      "Percentual com as casas indicadas pelo número (p0, p1, p2). Acrescenta o símbolo %.",
    exemplo: "[Margem:p1] → 12,5%",
  },
  {
    sintaxe: ":n0",
    descricao: "Número com separador de milhar e as casas decimais indicadas (n0, n2).",
    exemplo: "[Qtd:n0] → 1.234",
  },
];

function Secao({ titulo, tokens }: { titulo: string; tokens: Token[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-bold">{titulo}</h4>
      <ul className="space-y-2">
        {tokens.map((t) => (
          <li key={t.sintaxe} className="rounded-md border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                {t.sintaxe}
              </code>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t.descricao}</p>
            {t.exemplo && (
              <p className="mt-1 font-mono text-[11px] text-foreground/70">Ex.: {t.exemplo}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VariaveisDialog({
  trigger,
}: {
  /** Gatilho customizado; se omitido usa um botão "Variáveis". */
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="outline" size="sm">
              <HelpCircle className="size-4" /> Variáveis
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Variáveis disponíveis</DialogTitle>
          <DialogDescription>
            Escreva tokens entre colchetes no texto dos elementos. Eles são substituídos pelos dados
            da fonte ao gerar o documento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Secao titulo="Campos" tokens={ESTRUTURA} />
          <Secao titulo="Agregados (sobre a coleção)" tokens={AGREGADOS} />
          <Secao titulo="Especiais" tokens={ESPECIAIS} />
          <div className="space-y-2">
            <h4 className="text-sm font-bold">Formatação</h4>
            <p className="text-xs text-muted-foreground">
              Acrescente <code className="font-mono">:formato</code> antes do colchete de fechamento
              para formatar o valor.
            </p>
            <ul className="space-y-2">
              {FORMATOS.map((t) => (
                <li key={t.sintaxe} className="rounded-md border bg-muted/30 p-3">
                  <Badge variant="outline" className="font-mono">
                    {t.sintaxe}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">{t.descricao}</p>
                  {t.exemplo && (
                    <p className="mt-1 font-mono text-[11px] text-foreground/70">{t.exemplo}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Os campos disponíveis dependem da fonte de dados do modelo. Selecione um elemento de
            texto no editor para inserir os campos da fonte pelo seletor “Inserir campo”.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
