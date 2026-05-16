import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ExplorerPage } from "./routes/ExplorerPage";
import { AboutPage } from "./routes/AboutPage";
import { SensitivityPage } from "./routes/SensitivityPage";
import { BottomLoader } from "./components/BottomLoader";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ExplorerPage />} />
        <Route path="/sensitivity" element={<SensitivityPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
      <BottomLoader />
    </BrowserRouter>
  );
}
