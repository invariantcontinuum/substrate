"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ChevronDownIcon, CheckIcon } from "lucide-react";

const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" className={className} {...props} />;
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" className={className} {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger data-slot="select-trigger" data-size={size} className={className} {...props}>
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon />} />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({ className, children, side = "bottom", sideOffset = 4, align = "center", ...props }: SelectPrimitive.Popup.Props & Pick<SelectPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner side={side} sideOffset={sideOffset} align={align}>
        <SelectPrimitive.Popup data-slot="select-content" className={className} {...props}>
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return <SelectPrimitive.GroupLabel data-slot="select-label" className={className} {...props} />;
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item data-slot="select-item" className={className} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator render={<span />}>
        <CheckIcon />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return <SelectPrimitive.Separator data-slot="select-separator" className={className} {...props} />;
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
