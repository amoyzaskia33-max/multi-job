import * as React from "react";

import { cn } from "../../lib/cn";

interface SegmentOption<T extends string> {
  label: string;
  value: T;
}

interface SegmentControlProps<T extends string> {
  value: T;
  options: Array<SegmentOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: SegmentControlProps<T>) {
  return (
    <div className={cn("inline-flex rounded-lg border border-border bg-secondary p-1", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
