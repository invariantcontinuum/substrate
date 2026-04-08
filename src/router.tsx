import { Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GraphPage } from "@/pages/GraphPage";
import { CallbackPage } from "@/pages/CallbackPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/callback" element={<CallbackPage />} />
      <Route element={<DashboardLayout />}>
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/" element={<Navigate to="/graph" replace />} />
      </Route>
    </Routes>
  );
}
