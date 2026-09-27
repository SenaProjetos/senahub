"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListTree } from "lucide-react";
import { criarModelosDeDisciplinaEap } from "@/modules/planejamento/modelos/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";

/**
 * Um modelo de disciplina para cada disciplina do catálogo que este modelo de projeto tem (o que "Gerar EAP das
 * disciplinas" aplica). O confirm vem ANTES da transição — confirm dentro dela trava o React 19.
 */
export function CriarModelosDisciplinaBotao({ modeloId, disciplinas }: { modeloId: string; disciplinas: string[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  async function criar() {
    const ok = await confirm({
      title: `Criar ${disciplinas.length} modelo(s) de disciplina?`,
      description:
        `Um para cada disciplina deste modelo: ${disciplinas.join(", ")}. Cada um leva as fases e as tarefas da ` +
        "disciplina; os vínculos com outras disciplinas ficam de fora, e cada fase começa depois da anterior. " +
        "O que já existe com o mesmo nome não é duplicado.",
      confirmLabel: "Criar",
    });
    if (!ok) return;
    start(async () => {
      const r = await criarModelosDeDisciplinaEap({ modeloId });
      if (!r.ok) return void toast.error(r.error);
      const { criados, jaExistiam } = r.data;
      toast.success(criados.length > 0 ? `${criados.length} modelo(s) de disciplina criado(s).` : "Nenhum modelo novo.", {
        description: jaExistiam.length > 0 ? `Já existiam: ${jaExistiam.join(", ")}.` : "Estão em Modelos de EAP → Modelos de disciplina.",
      });
      router.push("/planejamento/modelos");
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => void criar()}>
      <ListTree className="size-3.5" /> {pending ? "Criando…" : "Criar modelos de disciplina"}
    </Button>
  );
}
