"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { assinarHolerite } from "@/modules/rh/folha/actions";
import type { HoleritePendente } from "@/modules/rh/folha/queries";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { brl, formatarData } from "@/lib/utils";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Fila de assinatura obrigatória (P4). Espelha `TermoAceiteForm`: o documento fica à vista,
 * uma caixa de confirmação e um botão — e NÃO um diálogo de confirmação, porque esta tela vive
 * no grupo `(auth)`, onde não existe `<ConfirmProvider>` (o `useConfirm` da ficha 360 quebraria).
 *
 * A navegação de saída é feita aqui no cliente (`router.replace("/")` quando a fila esvazia), e
 * não por `redirect()` do servidor: quem decide que acabou é a lista local, já esvaziada.
 */
export function AssinarHoleriteFila({ pendentes }: { pendentes: HoleritePendente[] }) {
  const router = useRouter();
  const [fila, setFila] = useState(pendentes);
  const [confirmado, setConfirmado] = useState(false);
  const [pending, start] = useTransition();

  const atual = fila[0];
  const restantes = fila.length;

  function avancar(aviso: () => void) {
    const resto = fila.slice(1);
    setFila(resto);
    setConfirmado(false);
    aviso();
    if (resto.length === 0) {
      router.replace("/");
      router.refresh();
    }
  }

  function assinar() {
    if (!atual || !confirmado) return;
    start(async () => {
      const r = await assinarHolerite({ id: atual.id });
      // Falha TAMBÉM avança a fila, de propósito: metade dos erros de `assinarHolerite` significa
      // que este holerite não é mais assinável (RH reabriu a folha, ou já foi assinado em outra
      // aba), e repetir o clique repetiria o mesmo erro pra sempre — a pessoa ficaria presa numa
      // tela cuja razão de existir é ser atravessada. Quem manda é o gate do layout, não esta
      // lista: se ainda houver pendência de verdade, `precisaAssinarHolerite` devolve a pessoa
      // pra uma fila recém-lida.
      if (!r.ok) {
        avancar(() => toast.error(r.error));
        return;
      }
      avancar(() =>
        fila.length > 1
          ? toast.success(`Holerite assinado — faltam ${fila.length - 1}.`)
          : toast.success("Holerite assinado. Bom trabalho!"),
      );
    });
  }

  async function sair() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  if (!atual) return null;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">
          {atual.tipo === "decimo_terceiro" ? "13º salário" : "Holerite"} de {MESES[atual.mes - 1]} de {atual.ano}
        </CardTitle>
        <CardDescription>
          {restantes > 1
            ? `Você tem ${restantes} holerites aguardando assinatura. Confira os valores e assine para continuar.`
            : "Confira os valores e assine para continuar usando o sistema."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-[45vh] overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Descrição</th>
                <th className="px-3 py-2 text-right font-medium">Provento</th>
                <th className="px-3 py-2 text-right font-medium">Desconto</th>
              </tr>
            </thead>
            <tbody>
              {atual.itens.map((it, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{it.descricao}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.tipo === "provento" ? brl(it.valor) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.tipo === "desconto" ? brl(it.valor) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/30 font-medium">
              <tr>
                <td className="px-3 py-2">Totais</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(atual.proventos)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(atual.descontos)}</td>
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2" colSpan={2}>
                  Líquido a receber
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(atual.liquido)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {atual.fechadaEm ? `Folha fechada em ${formatarData(atual.fechadaEm)}.` : null}
          </span>
          <Button
            size="sm"
            variant="ghost"
            render={
              <a
                href={`/api/rh/holerite/${atual.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <Download className="size-3.5" /> Baixar PDF
          </Button>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <Label className="flex items-start gap-2 font-normal">
          <Checkbox
            checked={confirmado}
            onCheckedChange={(checked) => setConfirmado(checked === true)}
            className="mt-0.5"
          />
          <span>
            Confirmo o recebimento dos valores deste holerite. Ficam registrados meu nome, a data
            e a hora.
          </span>
        </Label>
        <Button onClick={assinar} disabled={!confirmado || pending} className="w-full">
          {pending ? "Registrando…" : "Assinar e continuar"}
        </Button>
        <button
          type="button"
          onClick={sair}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Sair do sistema
        </button>
      </CardFooter>
    </Card>
  );
}
