# Graph Edge Symbols

The **Node Detail Panel** (opened by clicking any node in the graph canvas)
lists that node's neighbors. Each neighbor row uses a compact glyph to
represent the *type* of the edge connecting it to the selected node,
instead of spelling out the rel-type (e.g. `DEPENDS_ON`).

This keeps the neighbor list scannable and saves horizontal space, which
matters because the panel is only a few hundred pixels wide.

## Symbol table

| Glyph | Rel-type(s) it represents            | Intuition                                       |
| ----- | ------------------------------------ | ----------------------------------------------- |
| `→`   | `depends_on`, `dependsOn`, `depends` | Right-arrow: this node points at a dependency   |
| `↓`   | `imports`, `import`                  | Down-arrow: symbols flow **into** this node     |
| `↑`   | `exports`, `export`                  | Up-arrow: symbols flow **out of** this node     |
| `⊂`   | `contains`, `has`                    | Subset: the neighbor is inside the selected one |
| `⟶`   | `calls`, `invokes`                   | Long arrow: execution jump                      |
| `↟`   | `inherits`, `extends`                | Arrow with bar: "up the class hierarchy"        |
| `⊨`   | `implements`                         | Models: this node satisfies the interface       |
| `⟿`   | `uses`                               | Curly arrow: loose usage                        |
| `@`   | `references`, `refers`               | At-sign: named reference                        |
| `≡`   | `defines`, `declares`                | Identity: this node is the definition           |
| `§`   | `owns`                               | Section: ownership / authorship                 |
| `~`   | `related`                            | Tilde: generic relation                         |
| `◆`   | *(anything else)*                    | Diamond: fallback for unmapped types            |

## Matching rules

The mapping is case-insensitive and strips `_`, `-`, and whitespace from
the rel-type before lookup. That means the following all collapse to the
same entry:

- `DEPENDS_ON`
- `depends-on`
- `DependsOn`
- `depends on`

If no entry matches, the diamond glyph (`◆`) is shown. Unknown rel-types
should be added to the map rather than relying on the fallback.

## Where to change them

The mapping lives in a single constant in the Node Detail Panel:

```
frontend/src/components/panels/NodeDetailPanel.tsx
  └─ const REL_SYMBOL: Record<string, string>
  └─ function relSymbol(type: string): string
```

When a new rel-type is emitted by the ingestion graph writer
(`services/ingestion/src/graph_writer.py`), add the corresponding entry
here and update this document in the same commit so the UI stays in sync
with the actual graph schema.

## Accessibility

The glyph is purely visual. Each neighbor button carries:

- `aria-label={type}` on the glyph `<span>` so screen readers announce
  the full rel-type rather than the Unicode character.
- `title="${type} — ${name}"` on the button itself so hovering shows the
  full type and the neighbor's display name.

The neighbor's file name (or `file_path`, falling back to its UUID) is
shown as text beside the glyph, so the row is readable even if the glyph
renders as a tofu block in an older font.
