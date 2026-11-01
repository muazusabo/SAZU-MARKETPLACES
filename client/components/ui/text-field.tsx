import * as React from 'react';
import { Input } from './input';
import { Label } from './label';
import { cn } from '@/lib/utils';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/** Label + input + hint + error, wired together for screen readers. */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, hint, id, className, ...props }, ref) => {
    const autoId = React.useId();
    const fieldId = id ?? autoId;
    const describedBy = [hint && `${fieldId}-hint`, error && `${fieldId}-error`].filter(Boolean).join(' ') || undefined;
    return (
      <div className={cn('grid gap-1.5', className)}>
        <Label htmlFor={fieldId}>{label}</Label>
        <Input ref={ref} id={fieldId} aria-invalid={!!error} aria-describedby={describedBy} {...props} />
        {hint && !error && <p id={`${fieldId}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
        {error && <p id={`${fieldId}-error`} role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      </div>
    );
  },
);
TextField.displayName = 'TextField';
