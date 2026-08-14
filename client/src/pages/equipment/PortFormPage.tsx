import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createPort, getPort, updatePort } from "../../api/ports";
import { listHardwareModels } from "../../api/hardwareModels";
import type { HardwareModel } from "../../api/hardwareModels";
import { listLinkTypes } from "../../api/linkTypes";
import type { LinkType } from "../../api/linkTypes";
import { ApiError } from "../../api/client";

export function PortFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [hardwareModels, setHardwareModels] = useState<HardwareModel[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
  const [hardwareModelId, setHardwareModelId] = useState<number | "">("");
  const [linkTypeId, setLinkTypeId] = useState<number | "">("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ hardwareModels: hmList }, { linkTypes: ltList }] = await Promise.all([
        listHardwareModels(),
        listLinkTypes(),
      ]);
      setHardwareModels(hmList);
      setLinkTypes(ltList);
      if (isEdit) {
        const { port } = await getPort(Number(id));
        setHardwareModelId(port.hardwareModelId);
        setLinkTypeId(port.linkTypeId);
        setLabel(port.label);
      } else {
        if (hmList.length > 0) setHardwareModelId(hmList[0].id);
        if (ltList.length > 0) setLinkTypeId(ltList[0].id);
      }
      setLoading(false);
    }
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
      setLoading(false);
    });
  }, [id, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (hardwareModelId === "" || linkTypeId === "") return;
    setError(null);
    setSubmitting(true);
    try {
      const input = { hardwareModelId: Number(hardwareModelId), linkTypeId: Number(linkTypeId), label };
      if (isEdit) {
        await updatePort(Number(id), input);
      } else {
        await createPort(input);
      }
      navigate("/equipment/ports");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="form-page">
      <h1>{isEdit ? "Modifier l'entrée/sortie" : "Ajouter une entrée/sortie"}</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Matériel
          <select
            value={hardwareModelId}
            onChange={(e) => setHardwareModelId(Number(e.target.value))}
            required
          >
            {hardwareModels.map((hm) => (
              <option key={hm.id} value={hm.id}>
                {hm.brandName} — {hm.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type de liaison
          <select value={linkTypeId} onChange={(e) => setLinkTypeId(Number(e.target.value))} required>
            {linkTypes.map((lt) => (
              <option key={lt.id} value={lt.id}>
                {lt.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Label
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            Enregistrer
          </button>
          <button type="button" className="btn-outline" onClick={() => navigate("/equipment/ports")}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
