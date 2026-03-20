export type AppSection = "my-signal" | "station-finder";

interface Props {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
}

export function Sidebar({ activeSection, onSectionChange }: Props) {
  return (
    <nav className="sidebar">
      <button
        className={`sidebar-btn ${activeSection === "my-signal" ? "sidebar-btn--active" : ""}`}
        onClick={() => onSectionChange("my-signal")}
        title="My Signal"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
          <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
          <circle cx="12" cy="12" r="2" />
          <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
          <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
        </svg>
      </button>
      <button
        className={`sidebar-btn ${activeSection === "station-finder" ? "sidebar-btn--active" : ""}`}
        onClick={() => onSectionChange("station-finder")}
        title="Station Finder"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
    </nav>
  );
}
