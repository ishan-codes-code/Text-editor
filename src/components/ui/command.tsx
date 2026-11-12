import {
  Children,
  createContext,
  type HTMLAttributes,
  type InputHTMLAttributes,
  isValidElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/utils";

interface CommandItemRegistration {
  id: string;
  value: string;
  keywords?: string;
  disabled?: boolean;
  onSelect?: (value: string) => void;
}

interface CommandContextValue {
  search: string;
  setSearch: (search: string) => void;
  filtered: CommandItemRegistration[];
  register: (item: CommandItemRegistration) => void;
  unregister: (id: string) => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

function useCommandContext(): CommandContextValue {
  const ctx = useContext(CommandContext);
  if (ctx === null) {
    throw new Error("Command components must be used inside <Command>");
  }
  return ctx;
}

function matches(search: string, value: string, keywords?: string): boolean {
  const q = search.trim().toLowerCase();
  if (q === "") return true;
  return (
    value.toLowerCase().includes(q) ||
    (keywords?.toLowerCase().includes(q) ?? false)
  );
}

function Command({
  className,
  label,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { label?: string }) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CommandItemRegistration[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Stable callbacks: item effects depend on these, so new identities every
  // render would unregister/re-register in a loop.
  const register = useCallback((item: CommandItemRegistration) => {
    setItems((prev) =>
      prev.some((i) => i.id === item.id)
        ? prev.map((i) => (i.id === item.id ? item : i))
        : [...prev, item],
    );
  }, []);
  const unregister = useCallback((id: string) => {
    setItems((prev) =>
      prev.some((i) => i.id === id) ? prev.filter((i) => i.id !== id) : prev,
    );
  }, []);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) => !item.disabled && matches(search, item.value, item.keywords),
      ),
    [items, search],
  );

  // Keep the active item on the first match whenever the list changes.
  useEffect(() => {
    if (filtered.every((item) => item.id !== activeId)) {
      setActiveId(filtered[0]?.id ?? null);
    }
  }, [filtered, activeId]);

  const value = useMemo<CommandContextValue>(
    () => ({
      search,
      setSearch,
      filtered,
      register,
      unregister,
      activeId,
      setActiveId,
    }),
    [search, filtered, activeId, register, unregister],
  );

  return (
    <CommandContext.Provider value={value}>
      <div
        role="dialog"
        aria-label={label ?? "Command menu"}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-md",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </CommandContext.Provider>
  );
}

function moveActive(
  filtered: CommandItemRegistration[],
  activeId: string | null,
  direction: 1 | -1,
): string | null {
  if (filtered.length === 0) return null;
  const index = filtered.findIndex((item) => item.id === activeId);
  const next =
    index === -1
      ? direction === 1
        ? 0
        : filtered.length - 1
      : (index + direction + filtered.length) % filtered.length;
  return filtered[next]?.id ?? null;
}

function CommandInput({
  className,
  onKeyDown,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const { search, setSearch, filtered, activeId, setActiveId } =
    useCommandContext();

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveId(
        moveActive(filtered, activeId, event.key === "ArrowDown" ? 1 : -1),
      );
    } else if (event.key === "Enter") {
      const active = filtered.find((item) => item.id === activeId);
      if (active !== undefined) {
        event.preventDefault();
        active.onSelect?.(active.value);
      }
    }
  };

  return (
    <div className="flex items-center border-b px-3">
      <input
        role="combobox"
        aria-expanded="true"
        aria-autocomplete="list"
        autoComplete="off"
        spellcheck={false}
        value={search}
        onInput={(event) => setSearch((event.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { filtered } = useCommandContext();
  // Items self-hide on filter mismatch (each returns null), so they must
  // always stay mounted: mounting is what registers them for filtering,
  // keyboard nav and the empty state below.
  const all = Children.toArray(children);
  const emptyChild = all.find(
    (child) => isValidElement(child) && child.type === CommandEmpty,
  );
  const rest = all.filter(
    (child) => !(isValidElement(child) && child.type === CommandEmpty),
  );

  return (
    <div
      role="listbox"
      className={cn(
        "max-h-64 overflow-y-auto overflow-x-hidden p-1",
        className,
      )}
      {...props}
    >
      {rest}
      {filtered.length === 0 && emptyChild}
    </div>
  );
}

interface CommandItemProps
  extends Omit<HTMLAttributes<HTMLLIElement>, "onSelect"> {
  value: string;
  keywords?: string;
  disabled?: boolean;
  onSelect?: (value: string) => void;
}

function CommandItem({
  className,
  value,
  keywords,
  disabled,
  onSelect,
  children,
  ...props
}: CommandItemProps) {
  const id = useId();
  const { search, register, unregister, activeId, setActiveId } =
    useCommandContext();
  const ref = useRef<HTMLButtonElement | null>(null);
  const visible = matches(search, value, keywords);
  const active = activeId === id;

  useEffect(() => {
    register({ id, value, keywords, disabled, onSelect });
    return () => unregister(id);
  }, [id, value, keywords, disabled, onSelect, register, unregister]);

  useEffect(() => {
    // jsdom has no layout; guard so unit tests (and old browsers) skip this.
    if (active && typeof ref.current?.scrollIntoView === "function") {
      ref.current.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  if (!visible) return null;

  return (
    <li data-value={value} {...props}>
      <button
        ref={ref}
        type="button"
        role="option"
        aria-selected={active}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => {
          onSelect?.(value);
        }}
        onMouseMove={() => {
          if (!disabled) setActiveId(id);
        }}
        className={cn(
          "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
          active && "bg-accent text-accent-foreground",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
      >
        {children}
      </button>
    </li>
  );
}

function CommandEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function CommandGroup({
  className,
  heading,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { heading?: string }) {
  return (
    <div className={cn("overflow-hidden p-1", className)} {...props}>
      {heading !== undefined && (
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {heading}
        </div>
      )}
      {children}
    </div>
  );
}

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
};
