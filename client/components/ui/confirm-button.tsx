'use client';
import { useEffect, useState } from 'react';
import { Button, ButtonProps } from './button';

/** Two-step button for destructive actions: first click asks, second click confirms, it resets after a few seconds. */
export function ConfirmButton({ children, confirmLabel = 'Confirm?', onConfirm, ...props }: ButtonProps & { confirmLabel?: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <Button type="button" {...props} variant={armed ? 'default' : props.variant} className={armed ? 'bg-destructive hover:bg-destructive/90' : props.className}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : children}
    </Button>
  );
}
