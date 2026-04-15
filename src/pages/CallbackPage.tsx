import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

export function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.isLoading) {
      navigate(auth.isAuthenticated ? "/" : "/", { replace: true });
    }
  }, [auth.isLoading, auth.isAuthenticated, navigate]);

  return (
    <div className="callback-page">
      <div className="callback-spinner" />
      <p>Signing in…</p>
    </div>
  );
}
