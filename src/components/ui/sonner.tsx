import { X } from "lucide-preact";
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastData {
  id: number;
  title: string;
  description?: string;
  action?: ToastAction;
}

type ToastListener = (toasts: ToastData[]) => void;

let nextId = 1;
let toasts: ToastData[] = [];
const listeners = new Set<ToastListener>();

function emit(): void {
  for (const listener of listeners) listener([...toasts]);
}

function toast(
  title: string,
  options?: { description?: string; action?: ToastAction },
): number {
  const id = nextId++;
  toasts = [...toasts, { id, title, ...options }];
  emit();
  window.setTimeout(() => dismiss(id), 4000);
  return id;
}

function dismiss(id: number): void {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function useToasts(): ToastData[] {
  const [current, setCurrent] = useState<ToastData[]>(toasts);
  useEffect(() => {
    const listener: ToastListener = (next) => setCurrent(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return current;
}

function Toaster({ className }: { className?: string }) {
  const items = useToasts();
  return (
    <div
      aria-live="polite"
      data-testid="toaster"
      className={cn(
        "pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-lg"
        >
          <div className="flex-1 text-sm">
            <p className="font-medium">{item.title}</p>
            {item.description !== undefined && (
              <p className="mt-0.5 text-muted-foreground">{item.description}</p>
            )}
            {item.action !== undefined && (
              <button
                type="button"
                className="mt-2 font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => dismiss(item.id)}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export { dismiss, Toaster, toast };
