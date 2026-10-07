import { z } from "zod";
import type { TipoCampo } from "./tipo";

const esquema = z.string().email();
const limpo = (t: string) => t.trim().toLowerCase();

export const email: TipoCampo = {
  mascarar: (t) => t.replace(/\s/g, "").toLowerCase(),
  normalizar: limpo,
  validar: (t) => limpo(t) === "" || esquema.safeParse(limpo(t)).success,
  // A normalização só apara e põe em minúscula: nunca joga informação fora.
  limpo: () => true,
  essencia: limpo,
  significativo: (c) => !/\s/.test(c),
  mensagem: "E-mail inválido. Use o formato nome@empresa.com.br.",
  inputMode: "email",
  autoComplete: "email",
  placeholder: "nome@empresa.com.br",
};
