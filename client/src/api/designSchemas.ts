import { apiFetch } from "./client";

export interface DesignSchemaLayout {
  cards: { equipmentId: number; x: number; y: number; width?: number }[];
  bends: Record<number, number>;
  bendsY?: Record<number, number>;
  zoom?: number;
  textBlocks?: { id: number; x: number; y: number; fontSize: number; text: string }[];
}

export interface DesignSchema {
  id: number;
  apiId: number;
  layout: DesignSchemaLayout;
  updatedAt: string;
}

export function listDesignSchemas() {
  return apiFetch<{ schemas: DesignSchema[] }>("/design-schemas");
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
