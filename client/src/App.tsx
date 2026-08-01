import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Provider } from "jotai";
import { LandingPage } from "@/pages/LandingPage";
import { DatabaseListPage } from "@/pages/DatabaseListPage";
import { DatabaseFormPage } from "@/pages/DatabaseFormPage";

export function App() {
  return (
    <Provider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DatabaseListPage />} />
          <Route path="/welcome" element={<LandingPage />} />
          <Route path="/databases" element={<DatabaseListPage />} />
          <Route path="/new" element={<DatabaseFormPage />} />
          <Route path="/:id/edit" element={<DatabaseFormPage />} />
        </Routes>
      </BrowserRouter>
    </Provider>
  );
}
