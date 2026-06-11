import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buscarCep } from "@/lib/cep";

export async function GET(_req: Request, ctx: { params: Promise<{ cep: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { cep } = await ctx.params;
  const endereco = await buscarCep(cep);
  if (!endereco) return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 });
  return NextResponse.json(endereco);
}
