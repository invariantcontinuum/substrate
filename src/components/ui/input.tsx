import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <InputPrimitive type={type} data-slot="input" className={className} {...props} />;
}
