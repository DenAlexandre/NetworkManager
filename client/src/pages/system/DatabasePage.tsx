import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { downloadDatabaseBackup, restoreDatabase } from "../../api/system";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

export function DatabasePage() {
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
      await downloadDatabaseBackup();
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
        "Cette action va remplacer TOUTES les données actuelles de l'application par celles du fichier de sauvegarde. Cette action est irréversible. Continuer ?"
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
      await restoreDatabase(payload);
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
    <div className="card">
      <div className="page-header">
        <h2>Base de données</h2>
      </div>

      <div className="card card-compact-top">
        <h2>Sauvegarde</h2>
        <p className="muted">
          Télécharge un fichier contenant l'intégralité des données de l'application (hors fichiers images et PDF,
          qui restent sur le serveur).
        </p>
        <button type="button" className="btn" onClick={handleBackup} disabled={backingUp}>
          {backingUp ? "Préparation..." : "Télécharger la sauvegarde"}
        </button>
        {backupError && <p className="error">{backupError}</p>}
      </div>

      <div className="card card-compact-top">
        <h2>Restauration</h2>
        <p className="error">
          Attention : la restauration remplace intégralement les données actuelles par celles du fichier choisi.
          Cette action est irréversible et déconnectera tous les utilisateurs.
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
    </div>
  );
}
