import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { downloadRightsBackup, restoreRights } from "../../api/system";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

// Sauvegarde/restauration de la Gestion des droits (Utilisateurs/Rôle/Droits), séparée de la
// sauvegarde "Données" : voir server/src/routes/system.ts (/database/backup-rights,
// /database/restore-rights).
export function RightsBackupCard() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleBackup() {
    setBackupError(null);
    setBackingUp(true);
    try {
      await downloadRightsBackup();
    } catch (err) {
      setBackupError(err instanceof ApiError ? err.message : "Erreur lors de la sauvegarde.");
    } finally {
      setBackingUp(false);
    }
  }

  async function handleRestore() {
    if (!restoreFile) return;
    if (
      !window.confirm(
        "Cette action va remplacer TOUS les comptes utilisateurs, rôles et droits actuels par ceux du fichier de " +
          "sauvegarde. Cette action est irréversible et déconnectera tous les utilisateurs. Continuer ?"
      )
    ) {
      return;
    }
    setRestoreError(null);
    setRestoring(true);
    try {
      const text = await restoreFile.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("Le fichier sélectionné n'est pas un fichier de sauvegarde JSON valide.");
      }
      await restoreRights(payload);
      setRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await logout();
      navigate("/login");
    } catch (err) {
      setRestoreError(err instanceof ApiError || err instanceof Error ? err.message : "Erreur lors de la restauration.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="card card-compact-top">
      <h2>Gestion des droits (Utilisateurs, Rôle, Droits)</h2>
      <p className="muted">
        Télécharge un fichier contenant les comptes utilisateurs, rôles et droits actuels, séparément du reste des
        données.
      </p>
      <button type="button" className="btn" onClick={handleBackup} disabled={backingUp}>
        {backingUp ? "Préparation..." : "Télécharger la sauvegarde"}
      </button>
      {backupError && <p className="error">{backupError}</p>}

      <hr />

      <p className="error">
        Attention : la restauration remplace intégralement les comptes, rôles et droits actuels par ceux du fichier
        choisi. Cette action est irréversible et déconnectera tous les utilisateurs.
      </p>
      <div className="inline-form">
        <label>
          Fichier de sauvegarde
          <input
            type="file"
            accept="application/json,.json"
            ref={fileInputRef}
            onChange={(e) => setRestoreFile(e.currentTarget.files?.[0] ?? null)}
            disabled={restoring}
          />
        </label>
        <button type="button" className="danger" onClick={handleRestore} disabled={!restoreFile || restoring}>
          {restoring ? "Restauration..." : "Restaurer"}
        </button>
      </div>
      {restoreError && <p className="error">{restoreError}</p>}
    </div>
  );
}
