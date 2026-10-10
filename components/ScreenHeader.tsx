// Screen name left, italic context right, hairline under (.rr-header).
export function ScreenHeader({
  title,
  context,
}: {
  title: string;
  context?: string;
}) {
  return (
    <header className="rr-header">
      <h1 className="rr-label">{title}</h1>
      {context && <span className="rr-header__context">{context}</span>}
    </header>
  );
}
