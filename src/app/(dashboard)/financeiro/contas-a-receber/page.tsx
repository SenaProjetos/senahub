import { redirect } from "next/navigation";

export default function ContasAReceberPage() {
  redirect("/financeiro/contas?tab=receita");
}
