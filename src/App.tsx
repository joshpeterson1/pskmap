import { useState } from "react";
import { Sidebar, type AppSection } from "./components/Sidebar";
import { MySignalSection } from "./components/MySignalSection";
import { StationFinderSection } from "./components/StationFinderSection";
import "./App.css";

function App() {
  const [activeSection, setActiveSection] = useState<AppSection>("my-signal");

  return (
    <div className="app">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <div className={`app-main ${activeSection === "my-signal" ? "" : "section-hidden"}`}>
        <MySignalSection />
      </div>
      <div className={`app-main ${activeSection === "station-finder" ? "" : "section-hidden"}`}>
        <StationFinderSection />
      </div>
    </div>
  );
}

export default App;
