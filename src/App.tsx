import { useAuth } from "react-oidc-context";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/router";

function LoadingScreen() {
  return (
    <div>
      <div>S</div>
      <div>
        <span>Substrate</span>
        <span>Initializing...</span>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div>
      <div>!</div>
      <div>
        <span>Authentication Error</span>
        <span>{message}</span>
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
