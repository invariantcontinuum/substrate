import { useAuth } from "react-oidc-context";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/router";

function LoadingScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center h-screen gap-6"
      style={{ background: "#060608" }}
    >
      <div className="relative">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.2)",
            boxShadow: "0 0 40px rgba(99,102,241,0.1)",
          }}
        >
          <span style={{ color: "#6366f1", fontSize: 20, fontWeight: 800 }}>S</span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <span style={{ color: "#f0f0f5", fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Substrate
        </span>
        <span style={{ color: "#4a4a60", fontSize: 11 }}>
          Initializing...
        </span>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-screen gap-4"
      style={{ background: "#060608" }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.2)",
        }}
      >
        <span style={{ color: "#ef4444", fontSize: 16 }}>!</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span style={{ color: "#fca5a5", fontSize: 12, fontWeight: 500 }}>
          Authentication Error
        </span>
        <span style={{ color: "#4a4a60", fontSize: 11, maxWidth: 300, textAlign: "center" }}>
          {message}
        </span>
      </div>
    </div>
  );
}

export function App() {
  const auth = useAuth();

  if (auth.isLoading) return <LoadingScreen />;
  if (auth.error) return <ErrorScreen message={auth.error.message} />;

  if (!auth.isAuthenticated) {
    auth.signinRedirect();
    return <LoadingScreen />;
  }

  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
}
