import {
  Bold,
  Check,
  Italic,
  Moon,
  Palette,
  RefreshCw,
  Settings,
  Sun,
  Underline,
} from "lucide-preact";
import { useEffect, useMemo, useState } from "react";
import { Button } from "./components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./components/ui/sheet";
import { Toaster, toast } from "./components/ui/sonner";
import { useTiptapEditor } from "./hooks/useTiptapEditor";
import { ensurePersistentStorage, initPwa } from "./pwa";

const THEME_KEY = "editor:theme";

function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(currentTheme);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      const initial =
        stored === "light" || stored === "dark"
          ? stored
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      document.documentElement.classList.toggle("dark", initial === "dark");
      setTheme(initial);
    } catch {
      // Storage can throw in private mode; the default theme still applies.
    }
  }, []);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.classList.toggle("dark", next === "dark");
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // Ignore; the toggle still works for this session.
        }
        setTheme(next);
      }}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

const FONT_OPTIONS = [
  { value: "System default", keywords: "sans system" },
  { value: "Serif", keywords: "times georgia" },
  { value: "Monospace", keywords: "mono code" },
  { value: "Kruti Dev (upload in phase 4)", keywords: "hindi kruti dev" },
];

export function App() {
  const { mountRef, editor } = useTiptapEditor();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const pwa = useMemo(() => initPwa(), []);

  useEffect(
    () =>
      pwa.subscribe((status) => {
        setUpdateAvailable(status.state === "ready" && status.updateAvailable);
      }),
    [pwa],
  );

  useEffect(() => {
    ensurePersistentStorage()
      .then(setPersisted)
      .catch(() => setPersisted(false));
  }, []);

  useEffect(() => {
    if (editor === null) return;
    const recount = () => {
      const words = editor.getText().trim().split(/\s+/).filter(Boolean);
      setWordCount(editor.getText().trim() === "" ? 0 : words.length);
    };
    recount();
    editor.on("update", recount);
    return () => {
      editor.off("update", recount);
    };
  }, [editor]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {updateAvailable && (
        <div
          role="alert"
          className="flex items-center justify-center gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          <span>Update available.</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
            onClick={() => {
              pwa.update().catch(() => {
                toast("Update failed", {
                  description: "Try again once your edits are saved.",
                });
              });
            }}
          >
            <RefreshCw className="size-4" /> Update now
          </button>
        </div>
      )}

      <header className="sticky top-0 z-10 border-b bg-background/95">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
          <h1 className="text-base font-semibold">Offline text editor</h1>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            Phase 1 shell
          </span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Sheet>
              <SheetTrigger>
                <Button variant="ghost" size="icon" aria-label="Open settings">
                  <Settings />
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>Settings</SheetTitle>
                  <SheetDescription>
                    Storage, appearance and backup live here from phase 3.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4 text-sm">
                  <p>
                    Persistent storage:{" "}
                    <strong>
                      {persisted === null
                        ? "checking…"
                        : persisted
                          ? "granted"
                          : "not granted — install the app and back up"}
                    </strong>
                  </p>
                </div>
                <div className="mt-4 flex justify-end">
                  <SheetClose>
                    <Button variant="outline">Close</Button>
                  </SheetClose>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="border-t">
          <div className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto px-4 py-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Bold (phase 2)"
              onClick={() => toast("Bold lands in phase 2")}
            >
              <Bold />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Italic (phase 2)"
              onClick={() => toast("Italic lands in phase 2")}
            >
              <Italic />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Underline (phase 2)"
              onClick={() => toast("Underline lands in phase 2")}
            >
              <Underline />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="outline" size="sm">
                  Insert
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Insert (phase 5)</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => toast("Tables land in phase 5")}
                >
                  Table
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => toast("Images land in phase 5")}
                >
                  Image
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    toast("Character palette lands in phase 4", {
                      description: "Palette",
                    })
                  }
                >
                  <Palette className="size-4" /> Symbol
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog>
              <DialogTrigger>
                <Button variant="outline" size="sm">
                  About
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Offline text editor</DialogTitle>
                  <DialogDescription>
                    Installable PWA shell. The editor, storage and fonts arrive
                    in phases 2–4.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose>
                    <Button variant="outline">Close</Button>
                  </DialogClose>
                  <DialogClose>
                    <Button
                      onClick={() =>
                        toast("Saved", {
                          description: "Autosave lands in phase 3.",
                        })
                      }
                    >
                      <Check className="size-4" /> Got it
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <section
          aria-label="Font picker scaffold"
          className="mb-6 rounded-lg border bg-card text-card-foreground"
        >
          <Command label="Font picker">
            <CommandInput placeholder="Search fonts…" />
            <CommandList>
              <CommandGroup heading="Fonts">
                {FONT_OPTIONS.map((font) => (
                  <CommandItem
                    key={font.value}
                    value={font.value}
                    keywords={font.keywords}
                    onSelect={(value) =>
                      toast(`Font: ${value}`, {
                        description: "Custom fonts land in phase 4.",
                      })
                    }
                  >
                    {font.value}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandEmpty>No fonts found.</CommandEmpty>
            </CommandList>
          </Command>
        </section>

        <section
          aria-label="Editor"
          className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div ref={mountRef} />
        </section>

        <footer className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span data-testid="word-count">{wordCount} words</span>
          <span data-testid="persist-status">
            {persisted === null
              ? "Storage: checking…"
              : persisted
                ? "Storage: persistent"
                : "Storage: not persistent"}
          </span>
        </footer>
      </main>

      <Toaster />
    </div>
  );
}
