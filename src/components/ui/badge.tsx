import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@/lib/utils";

interface BadgeProps extends useRender.ComponentProps<"span"> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
}

export function Badge({ className, variant = "default", render, ...props }: BadgeProps) {
  const variants: Record<string, string> = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive/10 text-destructive",
    outline: "border border-border text-foreground",
    ghost: "hover:bg-muted hover:text-muted-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(
          "inline-flex h-5 w-fit items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          variants[variant],
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "badge", variant },
  });
}
