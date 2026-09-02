export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="appEmptyState">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
