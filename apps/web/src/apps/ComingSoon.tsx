import { useApp } from "./AppLayout";

export default function ComingSoon() {
  const app = useApp();
  return (
    <div className="coming-soon">
      <img className="coming-logo" src={app.logo} alt="" />
      <p><strong>{app.name}</strong> está en construcción.</p>
      <p className="muted">Ya puedes tener tus grupos; el contenido llegará pronto.</p>
    </div>
  );
}
