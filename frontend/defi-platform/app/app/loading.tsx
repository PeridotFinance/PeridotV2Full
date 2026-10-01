export default function Loading() {
  return (
    <div className="min-h-[60vh] w-full flex flex-col items-center justify-center px-4">
      <div className="flex items-center gap-3 mb-6 text-muted-foreground">
        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span>Loading…</span>
      </div>

      <div className="w-full max-w-4xl space-y-3">
        <div className="h-10 w-1/3 rounded-md bg-foreground/10 animate-pulse" />
        <div className="h-24 w-full rounded-lg bg-foreground/5 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="h-40 rounded-lg bg-foreground/5 animate-pulse" />
          <div className="h-40 rounded-lg bg-foreground/5 animate-pulse" />
        </div>
      </div>
    </div>
  )
}
