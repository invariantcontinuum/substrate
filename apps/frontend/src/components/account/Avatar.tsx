interface Props {
  name?: string | null;
  email?: string | null;
  size?: number;
}

export function Avatar({ name, email, size = 44 }: Props) {
  const letter = (name ?? email ?? "?").trim()[0]?.toUpperCase() ?? "?";
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size / 2.5) }}
      aria-label="avatar"
    >
      {letter}
    </div>
  );
}
