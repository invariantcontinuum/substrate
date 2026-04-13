import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonPrimitive.Props {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
  size?: "default" | "sm" | "icon" | "icon-sm" | "icon-xs";
}

export function Button({ className, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn("border border-black text-black bg-white px-3 py-1", className)}
      {...props}
    />
  );
}
