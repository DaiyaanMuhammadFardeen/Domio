export function ListingSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-panel" aria-hidden="true">
      <div className="aspect-[4/3] skeleton" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-3/4 skeleton" />
        <div className="h-3 w-1/3 skeleton" />
        <div className="flex items-center justify-between pt-2">
          <div className="h-3 w-20 skeleton" />
          <div className="h-4 w-12 skeleton" />
        </div>
      </div>
    </div>
  );
}

export function ListingGridSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading listings"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <ListingSkeleton key={i} />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export function ListingDetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-12" role="status" aria-label="Loading listing details">
      <div className="grid gap-8 lg:grid-cols-[1fr,360px]">
        <div className="aspect-video w-full skeleton rounded-2xl" />
        <div className="space-y-4">
          <div className="h-8 w-3/4 skeleton" />
          <div className="h-4 w-1/2 skeleton" />
          <div className="h-12 w-full skeleton" />
          <div className="h-4 w-2/3 skeleton" />
        </div>
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
