import * as React from "react";

interface BadgeProps extends React.ComponentProps<"span"> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
}

export function Badge({ className = "", ...props }: BadgeProps) {
  return <span data-slot="badge" className={`ui-badge ${className}`} {...props} />;
}
