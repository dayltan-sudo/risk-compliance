import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './layout/AppShell';
import { AuditPage } from './pages/Audit';
import { Contracts } from './pages/Contracts';
import { CoveragePage } from './pages/Coverage';
import { DocumentsPage } from './pages/Documents';
import { Exclusions } from './pages/Exclusions';
import { GlobalMapPage } from './pages/GlobalMap';
import { HotspotsPage } from './pages/Hotspots';
import { OverviewPage } from './pages/Overview';
import { RenewalsPage } from './pages/Renewals';
import { ReportPage } from './pages/Report';

/**
 * Six screens wired. Ingestion and the assistant dock land in P5/P6, and the
 * audit view in P7; each is added here when its unit lands.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="map" element={<GlobalMapPage />} />
        <Route path="coverage" element={<CoveragePage />} />
        <Route path="hotspots" element={<HotspotsPage />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="exclusions" element={<Exclusions />} />
        <Route path="renewals" element={<RenewalsPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
