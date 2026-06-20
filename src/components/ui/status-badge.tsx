import { Check, Clock, X, Info, Minus, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<Tone, { icon: LucideIcon; className: string }> = {
  success: { icon: Check, className: "bg-success/10 text-success border-success/40" },
  warning: { icon: Clock, className: "bg-warning/10 text-warning border-warning/40" },
  danger: { icon: X, className: "bg-destructive/10 text-destructive border-destructive/40" },
  info: { icon: Info, className: "bg-info/10 text-info border-info/40" },
  neutral: { icon: Minus, className: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: toneClass } = TONE[tone];
  return (
    <Badge variant="outline" className={cn("gap-1", toneClass, className)}>
      <Icon className="size-3" aria-hidden />
      {children}
    </Badge>
  );
}
