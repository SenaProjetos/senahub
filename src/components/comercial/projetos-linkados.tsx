"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { desfazerLinkProjeto } from "@/modules/comercial/vinculo/actions";
import { MOTIVO_CRIADO_PELO_ACEITE } from "@/modules/comercial/vinculo/regras";
import { LinkarProjetoDialog } from "./linkar-projeto-dialog";

type Projeto = { id: string; codigo: string; nome: string; criadoPeloAceite: boolean };

/** Bloco da ficha contratada: os projetos já linkados (com atalho) e o botão de linkar mais um. */
export function ProjetosLinkados({
  negociacaoId,
  contratada,
  podeVincular,
  projetos,
}: {
  negociacaoId: string;
  contratada: boolean;
  podeVincular: boolean;
  projetos: Projeto[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);

  if (!contratada && projetos.length === 0) return null;

  // confirm SEMPRE antes do start().
  async function desfazer(p: Projeto) {
    const ok = await confirm({
      title: "Desfazer o link com este projeto?",
      description: `${p.codigo} deixa de apontar para esta ficha. Os arquivos e dados que já foram importados continuam no projeto.`,
      confirmLabel: "Desfazer link",
    });
    if (!ok) return;
    start(async () => {
      const r = await desfazerLinkProjeto({ projetoId: p.id });
      if (r.ok) {
        toast.success("Link desfeito.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-2 rounded-sm border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Projetos linkados</h3>
        {podeVincular && contratada && (
          <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
            <Link2 className="size-3.5" /> Linkar projeto
          </Button>
        )}
      </div>
      {projetos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum projeto linkado a esta ficha ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {projetos.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
              <Link href={`/projetos/${p.id}`} className="min-w-0 truncate font-medium hover:underline">
                {p.codigo} · {p.nome}
              </Link>
              {podeVincular && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => desfazer(p)}
                  disabled={pending || p.criadoPeloAceite}
                  title={p.criadoPeloAceite ? MOTIVO_CRIADO_PELO_ACEITE : undefined}
                >
                  <Unlink className="size-3.5" /> Desfazer link
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {podeVincular && <LinkarProjetoDialog alvo={{ modo: "ficha", negociacaoId }} aberto={aberto} onAbertoChange={setAberto} />}
    </div>
  );
}
