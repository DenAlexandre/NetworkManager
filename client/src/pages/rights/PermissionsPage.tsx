import { useEffect, useState } from "react";
import { getRole, listRoles, updateRole } from "../../api/roles";
import type { Role } from "../../api/roles";
import { ApiError } from "../../api/client";
import { SECTIONS, SECTION_LABELS } from "../../constants/permissions";
import type { AccessLevel, Section } from "../../constants/permissions";

type MatrixLevel = "none" | AccessLevel;

function emptyMatrix(): Record<Section, MatrixLevel> {
  return Object.fromEntries(SECTIONS.map((s) => [s, "none"])) as Record<Section, MatrixLevel>;
}

export function PermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [roleName, setRoleName] = useState("");
  const [matrix, setMatrix] = useState<Record<Section, MatrixLevel>>(emptyMatrix);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    listRoles()
      .then(({ roles }) => {
        // The "Admin" role bypasses role_permissions entirely (see requirePermission), so its
        // matrix isn't meaningful to edit — every other role, including the default "Utilisateur"
        // system role, can have its permissions configured here.
        const editable = roles.filter((r) => !r.isAdmin);
        setRoles(editable);
        setSelectedId(editable[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    setMatrixLoading(true);
    setSaved(false);
    setError(null);
    getRole(selectedId)
      .then(({ role }) => {
        setRoleName(role.name);
        const next = emptyMatrix();
        for (const section of SECTIONS) {
          const level = role.permissions[section];
          if (level) next[section] = level;
        }
        setMatrix(next);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setMatrixLoading(false));
  }, [selectedId]);

  async function handleSave() {
    if (selectedId === null) return;
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      const permissions = SECTIONS.filter((s) => matrix[s] !== "none").map((section) => ({
        section,
        accessLevel: matrix[section] as AccessLevel,
      }));
      await updateRole(selectedId, { name: roleName, permissions });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Droits</h2>
      </div>
      {error && <p className="error">{error}</p>}
      {roles.length === 0 ? (
        <p className="muted">
          Aucun rôle disponible. Créez-en un dans l'onglet "Rôle" pour lui configurer des droits.
        </p>
      ) : (
        <>
          <label>
            Rôle
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(Number(e.target.value))}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {matrixLoading ? (
            <p>Chargement...</p>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Aucun accès</th>
                    <th>Lecture</th>
                    <th>Lecture-écriture</th>
                  </tr>
                </thead>
                <tbody>
                  {SECTIONS.map((section) => (
                    <tr key={section}>
                      <td>{SECTION_LABELS[section]}</td>
                      {(["none", "read", "write"] as MatrixLevel[]).map((level) => (
                        <td key={level}>
                          <input
                            type="radio"
                            name={`section-${section}`}
                            checked={matrix[section] === level}
                            onChange={() => setMatrix((prev) => ({ ...prev, [section]: level }))}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="form-actions">
                <button type="button" onClick={handleSave} disabled={saving}>
                  Enregistrer
                </button>
                {saved && <span className="muted">Enregistré.</span>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
