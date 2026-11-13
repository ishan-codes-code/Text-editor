import { mergeAttributes, Node } from "@tiptap/core";
import { imageObjectURL } from "../storage/images";

/**
 * Store-backed image node (TRD F12). The document JSON references the image
 * by id (`images` store); bytes never live in the document, so docs stay
 * small and backups carry `images/<id>.webp` entries. Rendering resolves the
 * blob to an object URL lazily, which also works fully offline.
 */
export const ImageRef = Node.create({
  name: "imageRef",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      imageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-image-id"),
        renderHTML: (attributes) => {
          const id = (attributes as { imageId?: string | null }).imageId;
          if (!id) return {};
          return { "data-image-id": id };
        },
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute("alt"),
        renderHTML: (attributes) => {
          const alt = (attributes as { alt?: string | null }).alt;
          if (!alt) return {};
          return { alt };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[data-image-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { class: "doc-image" })];
  },

  addNodeView() {
    return ({ node }) => {
      const img = document.createElement("img");
      img.className = "doc-image";
      const id = (node.attrs as { imageId?: string | null }).imageId;
      const alt = (node.attrs as { alt?: string | null }).alt;
      if (alt) img.alt = alt;
      if (typeof id === "string" && id !== "") {
        img.dataset.imageId = id;
        img.alt = alt ?? "Image";
        void imageObjectURL(id).then((url) => {
          if (url !== null) img.src = url;
        });
      }
      return { dom: img };
    };
  },

  addCommands() {
    return {
      insertImageRef:
        (imageId: string, alt?: string) =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, attrs: { imageId, alt } })
            .run(),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageRef: {
      insertImageRef: (imageId: string, alt?: string) => ReturnType;
    };
  }
}
