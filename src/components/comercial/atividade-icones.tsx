import type { LucideIcon } from "lucide-react";
import { Link2, Mail, MessageCircle, Paperclip, Phone, StickyNote, Users, Zap } from "lucide-react";
import type { TipoAtividade } from "@/generated/prisma/client";

/**
 * F3.6 — ícone por canal, reusado pelo `<Timeline>` de qualquer tela do Comercial (ficha do lead
 * hoje, Empresa 360 na F3.7). Mesmo conjunto visual da popover de registro manual (F3.4).
 */
export const ATIVIDADE_ICONE: Record<TipoAtividade, LucideIcon> = {
  LIGACAO: Phone,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  LINKEDIN: Link2,
  REUNIAO: Users,
  NOTA: StickyNote,
  ANEXO: Paperclip,
  SISTEMA: Zap,
};
