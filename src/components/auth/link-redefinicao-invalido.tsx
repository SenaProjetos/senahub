import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/auth/brand-logo";

/** Link de nova senha vencido, já usado ou inválido. */
export function LinkRedefinicaoInvalido({ mensagem }: { mensagem: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <BrandLogo className="mb-2 h-14 w-auto" />
        <CardTitle role="heading" aria-level={1} className="text-xl">
          Link indisponível
        </CardTitle>
        <CardDescription>{mensagem}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button render={<a href="/login" />} nativeButton={false} className="w-full">
          Ir para o login
        </Button>
      </CardContent>
    </Card>
  );
}
