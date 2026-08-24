import { HR_ADMIN_ROLES, type Role } from "@/lib/roles";

export function podeResponderTicket(ticketAutorId: string, user: { id: string; role: Role }): boolean {
  return ticketAutorId === user.id || HR_ADMIN_ROLES.includes(user.role);
}
