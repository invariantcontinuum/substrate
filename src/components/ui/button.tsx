import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonPrimitive.Props {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
  size?: "default" | "sm" | "icon" | "icon-sm" | "icon-xs";
}

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  const variants: Record<string, string> = {
    default: "bg-primary text-primary-foreground hover:bg-primary/80",
    outline: "border border-border bg-background hover:bg-muted hover:text-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-muted hover:text-foreground",
    destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
    link: "text-primary underline-offset-4 hover:underline",
  };

  const sizes: Record<string, string> = {
    default: "h-8 px-3 text-sm",
    sm: "h-7 px-2.5 text-xs",
    icon: "h-8 w-8",
    "icon-sm": "h-7 w-7",
    "icon-xs": "h-6 w-6",
  };

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
