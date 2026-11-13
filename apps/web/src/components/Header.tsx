import type { ReactNode } from "react";

/** Header fijo (sticky) con zona izquierda, título y zona derecha. */
export default function Header({ left, title, right }: { left?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="app-header">
      <div className="slot">{left}</div>
      <h1>{title}</h1>
      <div className="slot end">{right}</div>
    </header>
  );
}
