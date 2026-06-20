"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { carimboPadrao } from "@/modules/documentos/carimbos";
import type { Prisma } from "@/generated/prisma/client";

const base = { modulo: "documentos", recurso: "documentos", permissao: "gerir" } as const;

const criarCarimboSchema = z.object({
  formato: z.enum(["A4", "A3", "A2", "A1", "A0"]),
});

/**
 * Cria um DocumentoModelo já com o carimbo padrão do formato escolhido
 * (prancha em paisagem, margens ABNT, selo no canto inferior direito).
 */
export const criarCarimbo = defineAction(
  { ...base, acao: "criar-carimbo", entidade: "DocumentoModelo", schema: criarCarimboSchema },
  async (i) => {
    const m = await prisma.documentoModelo.create({
      data: {
        nome: `Carimbo ${i.formato}`,
        tipo: "outro",
        fonte: "projeto",
        schemaJson: carimboPadrao(i.formato) as unknown as Prisma.InputJsonValue,
      },
    });
    revalidatePath("/documentos");
    return { id: m.id };
  },
);
