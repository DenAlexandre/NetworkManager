import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePermission } from "../hooks/usePermission";
import type { Section } from "../constants/permissions";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <p>Chargement...</p>;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <p>Chargement...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.role.isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}

export function SectionRoute({ section, children }: { section: Section; children: ReactNode }) {
  const { user, loading } = useAuth();
  const { canRead } = usePermission(section);

  if (loading) return <p>Chargement...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!canRead) return <Navigate to="/" replace />;

  return <>{children}</>;
}
