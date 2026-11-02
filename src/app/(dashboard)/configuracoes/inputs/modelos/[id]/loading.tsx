import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
