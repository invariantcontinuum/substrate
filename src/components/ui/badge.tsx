import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

interface BadgeProps extends useRender.ComponentProps<"span"> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
}

export function Badge({ className, variant = "default", render, ...props }: BadgeProps) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">({ className }, props),
    render,
    state: { slot: "badge", variant },
  });
}
