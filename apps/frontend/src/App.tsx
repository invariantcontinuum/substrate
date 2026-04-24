import { useEffect, useRef, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GraphPage } from "@/pages/GraphPage";
import { CallbackPage } from "@/pages/CallbackPage";
import { AskPage } from "@/pages/AskPage";
import { SourcesPage } from "@/pages/SourcesPage";
import { SourcesTab } from "@/pages/SourcesTab";
import { SourcesSnapshotsTab } from "@/pages/SourcesSnapshotsTab";
import { SourcesConfigTab } from "@/pages/SourcesConfigTab";
import { SourcesActivityTab } from "@/pages/SourcesActivityTab";
import { useGraphStore } from "@/stores/graph";
import { useSyncSetStore } from "@/stores/syncSet";
import { logger } from "@/lib/logger";

/**
 * Guard that redirects unauthenticated users to Keycloak.
 * Without this, the dashboard renders for anonymous users and any
 * API request goes out with no Authorization header, causing the
 * gateway to return 401 (the user just sees a silently failing UI).
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const fetchGraph = useGraphStore((s) => s.fetchGraph);

  const isLoading = auth.isLoading;
  const isAuthenticated = auth.isAuthenticated;
  const errorMessage = auth.error?.message;
  const navigatorActive = !!auth.activeNavigator;
  const accessToken = auth.user?.access_token;

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !errorMessage && !navigatorActive) {
      void auth.signinRedirect();
    }
  }, [isLoading, isAuthenticated, errorMessage, navigatorActive, auth]);

  // Silent token renewal can fail (network blip, refresh-token expired,
  // Keycloak session ended). When it does, oidc-client-ts keeps the
  // (now-stale) user in memory but every subsequent API call will 401.
  // Treat that as a hard logout: end the Keycloak session and bounce the
  // user back through signin so the SPA never sits on a dead token.
  useEffect(() => {
    return auth.events.addSilentRenewError(async (err) => {
      logger.warn("silent_renew_failed", { error: String(err) });
      try {
        await auth.signoutRedirect();
      } catch {
        // signoutRedirect can fail if the id_token is gone or the
        // end-session endpoint is unreachable. Drop the local user and
        // restart the login flow so the user isn't stranded.
        await auth.removeUser().catch(() => {});
        void auth.signinRedirect();
      }
    });
  }, [auth]);

  // Same treatment for an access-token expiry that wasn't recovered by
  // silent renew (e.g. refresh disabled or refresh-token TTL exceeded).
  useEffect(() => {
    return auth.events.addAccessTokenExpired(async () => {
      logger.warn("access_token_expired");
      try {
        await auth.signoutRedirect();
      } catch {
        await auth.removeUser().catch(() => {});
        void auth.signinRedirect();
      }
    });
  }, [auth]);

  // Keep __authToken in sync so the graph-store subscriber can call
  // fetchGraph with the current token after sync-set changes.
  useEffect(() => {
    const token = auth.user?.access_token;
    if (typeof window !== "undefined") {
      (window as Window & { __authToken?: string }).__authToken = token;
    }
  }, [auth.user?.access_token]);

  // Load the graph snapshot once the user is first signed in. We
  // intentionally fire this only on the *initial* successful auth, not
  // on every accessToken rotation: silent token renewal happens every
  // few minutes (Keycloak default ~5 min), and re-running fetchGraph on
  // each rotation would re-do a 3-5 MB request and a multi-second
  // cytoscape relayout for no user-visible benefit. After the first
  // load the syncSet subscriber in stores/graph.ts handles refetches
  // when the active sync set actually changes; the sentinel below
  // ensures we never fetch a second time just because the JWT rotated.
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    const ids = useSyncSetStore.getState().syncIds;
    if (ids.length === 0) return;
    void fetchGraph(accessToken, ids);
  }, [isAuthenticated, accessToken, fetchGraph]);

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
        <Route index element={<Navigate to="/graph" replace />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="ask" element={<AskPage />} />
        <Route path="sources" element={<SourcesPage />}>
          <Route index element={<SourcesTab />} />
          <Route path="snapshots" element={<SourcesSnapshotsTab />} />
          <Route path="config" element={<SourcesConfigTab />} />
          <Route path="activity" element={<SourcesActivityTab />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
