import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import { PasswordField } from "../components/PasswordField";

const EMPTY_FORM = {
  username: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
};

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof EMPTY_FORM) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(form);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'inscription.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="form-page">
      <h1>Inscription</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Pseudo
          <input type="text" value={form.username} onChange={update("username")} required />
        </label>
        <label>
          Nom
          <input type="text" value={form.lastName} onChange={update("lastName")} required />
        </label>
        <label>
          Prénom
          <input type="text" value={form.firstName} onChange={update("firstName")} required />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={update("email")} required />
        </label>
        <label>
          Téléphone
          <input type="tel" value={form.phone} onChange={update("phone")} required />
        </label>
        <label>
          Mot de passe (8 caractères minimum)
          <PasswordField
            value={form.password}
            onChange={update("password")}
            minLength={8}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          Créer mon compte
        </button>
      </form>
    </div>
  );
}
