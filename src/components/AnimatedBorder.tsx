interface AnimatedBorderProps {
  active: boolean;
  children: React.ReactNode;
  idleColor?: string;
}

const ACTIVE_COLOR = "#9B30FF";
const IDLE_COLOR = "#222";

export function AnimatedBorder({ active, children, idleColor = IDLE_COLOR }: AnimatedBorderProps) {
  return (
    <box
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      border
      borderStyle="rounded"
      borderColor={active ? ACTIVE_COLOR : idleColor}
    >
      {children}
    </box>
  );
}
