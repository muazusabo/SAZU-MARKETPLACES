import * as React from 'react';
import { Label } from './label';
import { cn } from '@/lib/utils';

interface Props extends React.SelectHTMLAttributes<HTMLSelectElement> { label: string; error?: string; hint?: string }

export const SelectField = React.forwardRef<HTMLSelectElement, Props>(({ label, error, hint, id, className, children, ...props }, ref) => {
  const auto = React.useId(); const fid = id ?? auto;
  const described = [hint && `${fid}-hint`, error && `${fid}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={fid}>{label}</Label>
      <select ref={ref} id={fid} aria-invalid={!!error} aria-describedby={described} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm disabled:opacity-50" {...props}>{children}</select>
      {hint && !error && <p id={`${fid}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p id={`${fid}-error`} role="alert" className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
});
SelectField.displayName = 'SelectField';
