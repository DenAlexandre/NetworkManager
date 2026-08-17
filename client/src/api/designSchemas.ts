import { apiFetch } from "./client";

export interface DesignSchemaLayout {
  cards: { equipmentId: number; x: number; y: number; width?: number }[];
  bends: Record<number, number>;
}

export interface DesignSchema {
  id: number;
  apiId: number;
  layout: DesignSchemaLayout;
  updatedAt: string;
}

export function getDesignSchema(apiId: number) {
  return apiFetch<{ schema: DesignSchema | null }>(`/design-schemas/${apiId}`);
}

export function saveDesignSchema(apiId: number, layout: DesignSchemaLayout) {
  return apiFetch<{ schema: DesignSchema }>(`/design-schemas/${apiId}`, {
    method: "PUT",
    body: JSON.stringify({ layout }),
  });
}
