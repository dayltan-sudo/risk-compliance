import { HashRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DirectoryPage } from "./pages/DirectoryPage";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { StartAssessmentPage } from "./pages/StartAssessmentPage";
import { AssessmentWorkspacePage } from "./pages/AssessmentWorkspacePage";
import { ApproverQueuePage } from "./pages/ApproverQueuePage";
import { AuditLogPage } from "./pages/AuditLogPage";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DirectoryPage />} />
          <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
          <Route path="/start" element={<StartAssessmentPage />} />
          <Route path="/assessments/:assessmentId" element={<AssessmentWorkspacePage />} />
          <Route path="/approvals" element={<ApproverQueuePage />} />
          <Route path="/audit" element={<AuditLogPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
