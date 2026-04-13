import { useAuth } from "react-oidc-context";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/router";

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 bg-background">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20">
        <span className="text-primary text-lg font-bold">S</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-foreground text-sm font-medium">Substrate</span>
        <span className="text-muted-foreground text-xs">Initializing...</span>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 bg-background">
      <div className="w-8 h-8 rounded-md flex items-center justify-center bg-destructive/10 border border-destructive/20">
        <span className="text-destructive text-sm font-bold">!</span>
      </div>
      <div className="flex flex-col items-center gap-1 text-center px-4">
        <span className="text-destructive text-sm font-medium">Authentication Error</span>
        <span className="text-muted-foreground text-xs max-w-xs">{message}</span>
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
