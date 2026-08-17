import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { createSite, deleteSiteDatasheet, getSite, updateSite, uploadSiteDatasheet } from "../../api/sites";
import { ApiError } from "../../api/client";
import { useSitesTree } from "../../context/SitesTreeContext";
import { Modal } from "../../components/Modal";

interface SiteFormModalProps {
  siteId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export function SiteFormModal({ siteId, onClose, onSaved }: SiteFormModalProps) {
  const isEdit = siteId !== null;
  const { refresh } = useSitesTree();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  const [datasheetPath, setDatasheetPath] = useState<string | null>(null);
  const [datasheetError, setDatasheetError] = useState<string | null>(null);
  const [datasheetUploading, setDatasheetUploading] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getSite(Number(siteId))
      .then(({ site }) => {
        setName(site.name);
        setDatasheetPath(site.datasheetPath);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [siteId, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateSite(Number(siteId), { name });
      } else {
        await createSite({ name });
      }
      refresh();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDatasheetChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    setDatasheetError(null);
    setDatasheetUploading(true);
    try {
      const { site } = await uploadSiteDatasheet(Number(siteId), file);
      setDatasheetPath(site.datasheetPath);
    } catch (err) {
      setDatasheetError(err instanceof ApiError ? err.message : "Erreur lors du téléversement.");
    } finally {
      setDatasheetUploading(false);
    }
  }

  async function handleRemoveDatasheet() {
    if (!window.confirm("Supprimer ce PDF ?")) return;
    setDatasheetError(null);
    try {
      const { site } = await deleteSiteDatasheet(Number(siteId));
      setDatasheetPath(site.datasheetPath);
    } catch (err) {
      setDatasheetError(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  return (
    <Modal title={isEdit ? "Modifier le site" : "Ajouter un site"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <>
          <form id="site-form" onSubmit={handleSubmit}>
            <label>
              Nom
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          </form>

          {isEdit && (
            <div className="card card-compact-top">
              <h2>Documentation</h2>
              <div className="inline-form">
                <label>
                  {datasheetPath ? "Remplacer le PDF" : "Ajouter un PDF"}
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleDatasheetChange}
                    disabled={datasheetUploading}
                  />
                </label>
                {datasheetPath && (
                  <button type="button" className="danger" onClick={handleRemoveDatasheet}>
                    Supprimer le PDF
                  </button>
                )}
              </div>
              {datasheetError && <p className="error">{datasheetError}</p>}
            </div>
          )}

          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" form="site-form" disabled={submitting}>
              Enregistrer
            </button>
            <button type="button" className="btn-outline" onClick={onClose}>
              Annuler
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
