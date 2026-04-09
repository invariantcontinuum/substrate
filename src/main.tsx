import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "react-oidc-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { oidcConfig } from "@/lib/auth";
import { queryClient } from "@/lib/api";
import { App } from "@/App";
import "@/styles/globals.css";

// Initialize theme from persisted state before React renders
const stored = localStorage.getItem("substrate-theme");
const theme = stored ? JSON.parse(stored)?.state?.theme : "dark";
document.documentElement.classList.add(theme || "dark");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider {...oidcConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AuthProvider>
  </React.StrictMode>
);
