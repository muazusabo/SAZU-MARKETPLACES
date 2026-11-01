'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

export function useBrowserFormDraft<T extends FieldValues>(key: string, form: UseFormReturn<T>) {
  const { getValues, reset, watch } = form;
  const ready = useRef(false);
  const paused = useRef(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const draft: unknown = JSON.parse(raw);
        if (draft && typeof draft === 'object' && !Array.isArray(draft)) {
          reset({ ...getValues(), ...draft });
          setHasDraft(true);
        }
      }
    } catch {
      setStorageFailed(true);
    } finally {
      ready.current = true;
    }
  }, [getValues, reset, key]);

  useEffect(() => {
    if (!ready.current) return;
    const subscription = watch((values) => {
      if (paused.current) return;
      try {
        window.localStorage.setItem(key, JSON.stringify(values));
        setHasDraft(true);
        setStorageFailed(false);
      } catch {
        setStorageFailed(true);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, key]);

  const clearDraft = useCallback(() => {
    paused.current = true;
    try {
      window.localStorage.removeItem(key);
      setHasDraft(false);
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
    window.setTimeout(() => { paused.current = false; }, 0);
  }, [key]);

  return { hasDraft, storageFailed, clearDraft };
}
