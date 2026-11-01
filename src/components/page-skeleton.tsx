import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui-kit";

/** Shown in place of a route while its code or data is still loading. */
export function PageSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8" aria-busy="true" aria-label="Loading page">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-56 sm:h-12 sm:w-72" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="space-y-3 p-4 sm:p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-3 w-28" />
          </Card>
        ))}
      </div>
      <Card className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full" />
      </Card>
    </div>
  );
}
