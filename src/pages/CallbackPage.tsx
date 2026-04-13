import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

export function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate("/graph", { replace: true });
    }
  }, [auth.isAuthenticated, navigate]);

  return (
    <div className="flex items-center justify-center h-screen bg-white text-black">
      Authenticating...
    </div>
  );
}
