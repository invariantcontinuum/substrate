import { useAuth } from "react-oidc-context";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/router";

export function App() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#060608",
          color: "#8888a0",
          fontFamily: "Inter, sans-serif",
        }}
      >
        Loading...
      </div>
    );
  }

  if (auth.error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#060608",
          color: "#ef4444",
          fontFamily: "Inter, sans-serif",
        }}
      >
        Auth error: {auth.error.message}
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    auth.signinRedirect();
    return null;
  }

  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
}
