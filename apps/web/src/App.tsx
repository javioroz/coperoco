import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./apps/AppLayout";
import { useAuth } from "./auth";
import GroupPage from "./pages/GroupPage";
import GroupsPage from "./pages/GroupsPage";
import JoinPage from "./pages/JoinPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";

export default function App() {
  const { session } = useAuth();

  if (!session) {
    return (
      <main>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </main>
    );
  }
  // Cada página renderiza su propio <Header> (sticky) y su <main>.
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/join/:code" element={<JoinPage />} />
      <Route path="/:appId" element={<AppLayout />}>
        <Route index element={<GroupsPage />} />
        <Route path="g/:id" element={<GroupPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
