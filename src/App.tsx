import { useEffect, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GraphPage } from "@/pages/GraphPage";
import { CallbackPage } from "@/pages/CallbackPage";
import { useGraphStore } from "@/stores/graph";

/**
 * Guard that redirects unauthenticated users to Keycloak.
 * Without this, the dashboard renders for anonymous users and any
 * API request goes out with no Authorization header, causing the
 * gateway to return 401 (the user just sees a silently failing UI).
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { fetchGraph } = useGraphStore();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !auth.error && !auth.activeNavigator) {
      void auth.signinRedirect();
    }
  }, [auth]);

  useEffect(() => {
    if (auth.isAuthenticated) {
      fetchGraph();
    }
  }, [auth.isAuthenticated, fetchGraph]);

  if (auth.isLoading || auth.activeNavigator) {
    return <div className="auth-status">Loading…</div>;
  }
  if (auth.error) {
    return <div className="auth-status">Authentication error: {auth.error.message}</div>;
  }
  if (!auth.isAuthenticated) {
    return <div className="auth-status">Redirecting to sign in…</div>;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/callback" element={<CallbackPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        }
      >
        <Route index element={<GraphPage />} />
      </Route>
    </Routes>
  );
}

export default App;
