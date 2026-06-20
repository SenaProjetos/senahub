"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { duplicarProjeto } from "@/modules/projetos/actions";
import { Button } from "@/components/ui/button";

export function DuplicarProjetoButton({ projetoId }: { projetoId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function duplicar() {
    start(async () => {
      const res = await duplicarProjeto({ id: projetoId });
      if (res.ok) {
        toast.success("Projeto duplicado.");
        router.push(`/projetos/${res.data.id}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={duplicar} disabled={pending}>
      <Copy className="size-4" /> Duplicar
    </Button>
  );
}
