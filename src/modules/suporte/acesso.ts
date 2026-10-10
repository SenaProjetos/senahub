/** Quem responde um ticket: o autor, a gestão de RH ou o superusuário (Onda F — era `HR_ADMIN_ROLES`). */
export function podeResponderTicket(
  ticketAutorId: string,
  user: { id: string; gereRh: boolean; superUsuario: boolean },
): boolean {
  return ticketAutorId === user.id || user.gereRh || user.superUsuario;
}
