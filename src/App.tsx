import { useAuth } from "react-oidc-context";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/router";

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 bg-white text-black">
      <div className="border border-black p-4">
        <span className="font-bold">S</span>
      </div>
      <div className="text-center">
        <span className="block font-medium">Substrate</span>
        <span className="block">Initializing...</span>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 bg-white text-black">
      <div className="border border-black p-3">
        <span className="font-bold">!</span>
      </div>
      <div className="text-center">
        <span className="block font-medium">Authentication Error</span>
        <span className="block max-w-xs">{message}</span>
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
