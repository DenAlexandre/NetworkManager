import { ApisImportExport } from "./ApisImportExport";
import { EquipmentImportExport } from "./EquipmentImportExport";
import { RoomsImport } from "./RoomsImport";
import { VariablesImportExport } from "./VariablesImportExport";

export function ImportExportPage() {
  return (
    <div className="card">
      <div className="page-header">
        <h2>Import/Export</h2>
      </div>

      <EquipmentImportExport />
      <RoomsImport />
      <ApisImportExport />
      <VariablesImportExport />
    </div>
  );
}
