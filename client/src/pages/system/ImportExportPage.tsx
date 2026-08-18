import { EquipmentImportExport } from "./EquipmentImportExport";
import { RoomsImport } from "./RoomsImport";

export function ImportExportPage() {
  return (
    <div className="card">
      <div className="page-header">
        <h2>Import/Export</h2>
      </div>

      <EquipmentImportExport />
      <RoomsImport />
    </div>
  );
}
