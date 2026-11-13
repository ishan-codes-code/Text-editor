import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SearchState {
  query: string;
  caseSensitive: boolean;
  index: number;
}

export interface SearchMeta {
  query?: string;
  caseSensitive?: boolean;
  index?: number;
  clear?: boolean;
}

export const searchPluginKey = new PluginKey<SearchState>("appSearch");

export interface TextMatch {
  from: number;
  to: number;
}

/** Finds all non-overlapping occurrences of the query in block text. */
export function findMatches(
  doc: PMNode,
  query: string,
  caseSensitive = false,
): TextMatch[] {
  if (query === "") return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: TextMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || node.text === undefined) return;
    const haystack = caseSensitive ? node.text : node.text.toLowerCase();
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      matches.push({ from: pos + at, to: pos + at + needle.length });
      from = at + Math.max(1, needle.length);
    }
  });
  return matches;
}

/**
 * Find and replace (TRD F11). A custom ProseMirror plugin: the query lives in
 * plugin state, matches render as decorations, and replace runs as ordinary
 * transactions so undo/redo and autosave keep working.
 */
export const Search = Extension.create({
  name: "appSearch",

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchPluginKey,
        state: {
          init: () => ({ query: "", caseSensitive: false, index: 0 }),
          apply: (tr, prev) => {
            const meta = tr.getMeta(searchPluginKey) as SearchMeta | undefined;
            if (meta === undefined) return prev;
            if (meta.clear === true) {
              return { query: "", caseSensitive: false, index: 0 };
            }
            const next: SearchState = {
              query: meta.query ?? prev.query,
              caseSensitive: meta.caseSensitive ?? prev.caseSensitive,
              index: meta.index ?? prev.index,
            };
            if (meta.query !== undefined || meta.caseSensitive !== undefined) {
              next.index = meta.index ?? 0;
            }
            return next;
          },
        },
        props: {
          decorations: (state) => {
            const search = searchPluginKey.getState(state);
            if (search === undefined || search.query === "") {
              return DecorationSet.empty;
            }
            const matches = findMatches(
              state.doc,
              search.query,
              search.caseSensitive,
            );
            if (matches.length === 0) return DecorationSet.empty;
            const current =
              ((search.index % matches.length) + matches.length) %
              matches.length;
            return DecorationSet.create(
              state.doc,
              matches.map((match, i) =>
                Decoration.inline(match.from, match.to, {
                  class:
                    i === current
                      ? "search-match search-current"
                      : "search-match",
                }),
              ),
            );
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setSearch:
        (query: string, options: { caseSensitive?: boolean } = {}) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchPluginKey, {
              query,
              caseSensitive: options.caseSensitive ?? false,
            } satisfies SearchMeta);
          }
          return true;
        },
      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch)
            tr.setMeta(searchPluginKey, { clear: true } satisfies SearchMeta);
          return true;
        },
      findStep:
        (delta: 1 | -1) =>
        ({ tr, dispatch, state }) => {
          const search = searchPluginKey.getState(state) ?? {
            query: "",
            index: 0,
          };
          if (search.query === "") return false;
          const matches = findMatches(
            state.doc,
            search.query,
            (search as SearchState).caseSensitive ?? false,
          );
          if (matches.length === 0) return false;
          const next =
            (((search.index + delta) % matches.length) + matches.length) %
            matches.length;
          if (dispatch) {
            tr.setMeta(searchPluginKey, { index: next } satisfies SearchMeta);
            const target = matches[next];
            if (target !== undefined) {
              tr.setSelection(
                TextSelection.create(tr.doc, target.from, target.to),
              );
            }
          }
          return true;
        },
      replaceNext:
        (replacement: string) =>
        ({ tr, dispatch, state }) => {
          const search = searchPluginKey.getState(state);
          if (search === undefined || search.query === "") return false;
          const matches = findMatches(
            state.doc,
            search.query,
            search.caseSensitive,
          );
          if (matches.length === 0) return false;
          const current =
            ((search.index % matches.length) + matches.length) % matches.length;
          const target = matches[current];
          if (target === undefined) return false;
          if (dispatch) {
            tr.replaceWith(
              target.from,
              target.to,
              state.schema.text(replacement),
            );
          }
          return true;
        },
      replaceAllMatches:
        (replacement: string) =>
        ({ tr, dispatch, state }) => {
          const search = searchPluginKey.getState(state);
          if (search === undefined || search.query === "") return false;
          const matches = findMatches(
            state.doc,
            search.query,
            search.caseSensitive,
          );
          if (matches.length === 0) return false;
          if (dispatch) {
            for (let i = matches.length - 1; i >= 0; i--) {
              const match = matches[i];
              if (match === undefined) continue;
              tr.replaceWith(
                match.from,
                match.to,
                state.schema.text(replacement),
              );
            }
          }
          return true;
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    appSearch: {
      setSearch: (
        query: string,
        options?: { caseSensitive?: boolean },
      ) => ReturnType;
      clearSearch: () => ReturnType;
      findStep: (delta: 1 | -1) => ReturnType;
      replaceNext: (replacement: string) => ReturnType;
      replaceAllMatches: (replacement: string) => ReturnType;
    };
  }
}
