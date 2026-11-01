import * as React from 'react';
import { Label } from './label';
import { cn } from '@/lib/utils';

interface Props extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label: string; error?: string; hint?: string }

export const TextareaField = React.forwardRef<HTMLTextAreaElement, Props>(({ label, error, hint, id, className, ...props }, ref) => {
  const auto = React.useId(); const fid = id ?? auto;
  const described = [hint && `${fid}-hint`, error && `${fid}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={fid}>{label}</Label>
      <textarea ref={ref} id={fid} rows={5} aria-invalid={!!error} aria-describedby={described} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground disabled:opacity-50" {...props} />
      {hint && !error && <p id={`${fid}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p id={`${fid}-error`} role="alert" className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
});
TextareaField.displayName = 'TextareaField';
