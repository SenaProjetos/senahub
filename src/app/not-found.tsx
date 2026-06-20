import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <FileQuestion className="size-12 text-muted-foreground" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground">
          O endereço acessado não existe ou o registro foi removido.
        </p>
      </div>
      <Button render={<Link href="/" />}>Voltar ao início</Button>
    </div>
  );
}
