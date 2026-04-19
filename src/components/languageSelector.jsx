import { useState } from "react";

const languages = [
  { label: "JavaScript", id: 63 },
  { label: "Python", id: 71 },
  { label: "C++", id: 54 },
  { label: "Java", id: 62 },
];

export default function LanguageSelector({ onChange }) {
  const [lang, setLang] = useState(languages[1]);

  const handleChange = (e) => {
    const selected = languages.find(l => l.id === Number(e.target.value));
    setLang(selected);
    onChange(selected);
  };

  return (
    <div className="relative inline-flex items-center">
      <select
        value={lang.id}
        onChange={handleChange}
        className="
          appearance-none font-mono text-[11px] font-bold tracking-widest uppercase
          text-purple-700 bg-purple-50 border border-purple-200
          pl-4 pr-8 py-1.5 rounded-full cursor-pointer outline-none
          hover:bg-purple-100 hover:border-purple-400
          focus:border-purple-600 focus:bg-purple-50
          transition-all duration-150
        "
        style={{ WebkitAppearance: "none" }}
      >
        {languages.map((l) => (
          <option key={l.id} value={l.id} style={{ background: "#fff", color: "#1a1a2e" }}>
            {l.label}
          </option>
        ))}
      </select>
      {/* Custom chevron */}
      <svg
        className="absolute right-2.5 pointer-events-none text-purple-400"
        width="10" height="6" viewBox="0 0 10 6" fill="none"
      >
        <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}