# web/ — UI component rules

**Use [shadcn/ui](https://ui.shadcn.com) components for all UI.** shadcn is set up in
this app (Tailwind v4 + `components.json`, base color neutral, `@/` → `src/`). When
building or changing anything in `web/`, reach for a shadcn component before writing a
bespoke one or hand-rolling CSS.

- **New UI** → add the component with `npx shadcn@latest add <name>`, then compose from
  it. It lands in `src/components/ui/`. Don't hand-write a button/dialog/input/etc. when
  shadcn ships one.
- **Existing bespoke UI** → the older components (`ConnectBar`, `BoardGrid`) and the
  hand-written rules in `src/index.css` predate shadcn. Prefer migrating them to the
  shadcn equivalent when you're already editing them; don't add new hand-rolled widgets
  alongside shadcn ones.
- **Styling** → use Tailwind utilities and the shadcn theme tokens (the CSS variables in
  `src/index.css` — `bg-background`, `text-foreground`, etc.), not ad-hoc hex colors or
  new one-off CSS.
- **Imports** → use the `@/` alias (`@/components/ui/button`, `@/lib/utils`).
