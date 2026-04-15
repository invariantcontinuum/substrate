import * as React from "react";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`ui-button ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
