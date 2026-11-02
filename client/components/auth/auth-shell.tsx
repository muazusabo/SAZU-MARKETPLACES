export function AuthShell({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="container grid max-w-md gap-6 py-12 sm:py-16">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {intro && <p className="mt-2 text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <p className="font-semibold">{message}</p>
    </div>
  );
}
