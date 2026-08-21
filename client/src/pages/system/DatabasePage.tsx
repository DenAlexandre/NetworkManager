import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  downloadDatabaseBackup,
  downloadFilesBackup,
  resetDatabaseKeepDataTypes,
  restoreDatabase,
  restoreFilesBackup,
} from "../../api/system";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { RightsBackupCard } from "./RightsBackupCard";

export function DatabasePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const [filesBackingUp, setFilesBackingUp] = useState(false);
  const [filesBackupError, setFilesBackupError] = useState<string | null>(null);

  const [restoreFilesArchive, setRestoreFilesArchive] = useState<File | null>(null);
  const [restoringFiles, setRestoringFiles] = useState(false);
  const [restoreFilesError, setRestoreFilesError] = useState<string | null>(null);
  const [restoreFilesSuccess, setRestoreFilesSuccess] = useState(false);
  const filesInputRef = useRef<HTMLInputElement>(null);

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

  async function handleFilesBackup() {
    setFilesBackupError(null);
    setFilesBackingUp(true);
    try {
      await downloadFilesBackup();
    } catch (err) {
      setFilesBackupError(err instanceof ApiError ? err.message : "Erreur lors de la sauvegarde des fichiers.");
    } finally {
      setFilesBackingUp(false);
    }
  }

  async function handleRestoreFiles() {
    if (!restoreFilesArchive) return;
    if (
      !window.confirm(
        "Cette action va remplacer TOUS les fichiers actuels (photos de matériel, fiches techniques) par ceux de " +
          "l'archive choisie. Cette action est irréversible. Continuer ?"
      )
    ) {
      return;
    }
    setRestoreFilesError(null);
    setRestoreFilesSuccess(false);
    setRestoringFiles(true);
    try {
      await restoreFilesBackup(restoreFilesArchive);
      setRestoreFilesArchive(null);
      if (filesInputRef.current) filesInputRef.current.value = "";
      setRestoreFilesSuccess(true);
    } catch (err) {
      setRestoreFilesError(err instanceof ApiError ? err.message : "Erreur lors de la restauration des fichiers.");
    } finally {
      setRestoringFiles(false);
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        "Cette action va supprimer TOUTES les données de l'application (sites, matériel, API, configurations switch/moxa, " +
          "schémas de câblage...) à l'exception des comptes utilisateurs et du catalogue \"Type des données\" " +
          "(marques, types de matériel, matériel, types de liaison). Cette action est irréversible. Continuer ?"
      )
    ) {
      return;
    }
    setResetError(null);
    setResetSuccess(false);
    setResetting(true);
    try {
      await resetDatabaseKeepDataTypes();
      setResetSuccess(true);
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : "Erreur lors de la réinitialisation.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="card">
      <div className="page-header">
        <h2>Base de données</h2>
      </div>

      <div className="card card-compact-top">
        <h2>Données</h2>
        <p className="muted">
          Télécharge un fichier contenant l'intégralité des données de l'application, hors Gestion des droits
          (comptes/rôles/droits, sauvegardés séparément ci-dessous) et fichiers images/PDF (sauvegardés
          séparément plus bas).
        </p>
        <button type="button" className="btn" onClick={handleBackup} disabled={backingUp}>
          {backingUp ? "Préparation..." : "Télécharger la sauvegarde"}
        </button>
        {backupError && <p className="error">{backupError}</p>}

        <hr />

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

      <RightsBackupCard />

      <div className="card card-compact-top">
        <h2>Fichiers (photos et fiches techniques)</h2>
        <p className="muted">
          Télécharge une archive contenant toutes les photos de matériel et fiches techniques (matériel et sites)
          actuellement stockées sur le serveur.
        </p>
        <button type="button" className="btn" onClick={handleFilesBackup} disabled={filesBackingUp}>
          {filesBackingUp ? "Préparation..." : "Télécharger les fichiers"}
        </button>
        {filesBackupError && <p className="error">{filesBackupError}</p>}

        <hr />

        <p className="error">
          Attention : la restauration remplace intégralement les fichiers actuels par ceux de l'archive choisie.
          Cette action est irréversible.
        </p>
        <div className="inline-form">
          <label>
            Archive de fichiers
            <input
              type="file"
              accept="application/zip,.zip"
              ref={filesInputRef}
              onChange={(e) => setRestoreFilesArchive(e.currentTarget.files?.[0] ?? null)}
              disabled={restoringFiles}
            />
          </label>
          <button
            type="button"
            className="danger"
            onClick={handleRestoreFiles}
            disabled={!restoreFilesArchive || restoringFiles}
          >
            {restoringFiles ? "Restauration..." : "Restaurer"}
          </button>
        </div>
        {restoreFilesError && <p className="error">{restoreFilesError}</p>}
        {restoreFilesSuccess && <p className="success">Les fichiers ont été restaurés.</p>}
      </div>

      <div className="card card-compact-top">
        <h3>Réinitialisation (RAZ)</h3>
        <p className="error">
          Attention : cette action supprime toutes les données (sites, matériel, API, configurations switch/moxa,
          schémas de câblage...) à l'exception des comptes utilisateurs et du catalogue "Type des données"
          (marques, types de matériel, matériel, types de liaison), qui sont conservés. Cette action est
          irréversible.
        </p>
        <button type="button" className="danger" onClick={handleReset} disabled={resetting}>
          {resetting ? "Réinitialisation..." : "Réinitialiser le système"}
        </button>
        {resetError && <p className="error">{resetError}</p>}
        {resetSuccess && <p className="success">Le système a été réinitialisé.</p>}
      </div>
    </div>
  );
}
