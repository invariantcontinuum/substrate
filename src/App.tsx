import { useEffect, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GraphPage } from "@/pages/GraphPage";
import { CallbackPage } from "@/pages/CallbackPage";

/**
 * Guard that redirects unauthenticated users to Keycloak.
 * Without this, the dashboard renders for anonymous users and any
 * API request goes out with no Authorization header, causing the
 * gateway to return 401 (the user just sees a silently failing UI).
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();

  const isLoading = auth.isLoading;
  const isAuthenticated = auth.isAuthenticated;
  const errorMessage = auth.error?.message;
  const navigatorActive = !!auth.activeNavigator;

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !errorMessage && !navigatorActive) {
      void auth.signinRedirect();
    }
  }, [isLoading, isAuthenticated, errorMessage, navigatorActive, auth]);

  if (isLoading || navigatorActive) {
    return <div className="auth-status">Loading…</div>;
  }
  if (errorMessage) {
    return <div className="auth-status">Authentication error: {errorMessage}</div>;
  }
  if (!isAuthenticated) {
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
