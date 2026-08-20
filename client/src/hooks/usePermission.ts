import { useAuth } from "../context/AuthContext";
import type { Section } from "../constants/permissions";

export function usePermission(section: Section) {
  const { user } = useAuth();
  const isAdmin = user?.role.isAdmin ?? false;
  const level = user?.permissions[section];
  return {
    canRead: isAdmin || level === "read" || level === "write",
    canWrite: isAdmin || level === "write",
  };
}
