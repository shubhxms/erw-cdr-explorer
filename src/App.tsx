import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ExplorerPage } from "./routes/ExplorerPage";
import { AboutPage } from "./routes/AboutPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ExplorerPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </BrowserRouter>
  );
}
