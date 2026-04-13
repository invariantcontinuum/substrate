import { Button as ButtonPrimitive } from "@base-ui/react/button";

interface ButtonProps extends ButtonPrimitive.Props {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
  size?: "default" | "sm" | "icon" | "icon-sm" | "icon-xs";
}

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return <ButtonPrimitive data-slot="button" className={className} {...props} />;
}
