import { useApp } from "./AppLayout";

export default function ComingSoon() {
  const app = useApp();
  return (
    <div className="coming-soon">
      <div className="big">{app.icon}</div>
      <p><strong>{app.name}</strong> está en construcción.</p>
      <p className="muted">Ya puedes tener tus grupos; el contenido llegará pronto.</p>
    </div>
  );
}
