import type { JSX } from "preact";
import { Icon, type IconName } from "./Icon";

type ActionButtonProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, "size" | "icon"> & {
  icon?: IconName;
  label: string;
  busyLabel?: string;
  busy?: boolean;
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "icon" | "compact" | "full";
};

export function ActionButton({
  icon,
  label,
  busyLabel,
  busy = false,
  variant = "default",
  size = "compact",
  class: className = "",
  disabled,
  title,
  type = "button",
  ...props
}: ActionButtonProps) {
  const text = busy && busyLabel ? busyLabel : label;
  const iconOnly = size === "icon";
  const classes = [
    "gsv-action-control",
    `is-${variant}`,
    `is-${size}`,
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      {...props}
      type={type}
      class={classes}
      disabled={disabled || busy}
      title={title ?? label}
      aria-label={iconOnly ? text : props["aria-label"] ?? undefined}
    >
      {icon ? <Icon name={icon} /> : null}
      <span class={iconOnly ? "gsv-visually-hidden" : "gsv-action-control-label"}>{text}</span>
    </button>
  );
}
