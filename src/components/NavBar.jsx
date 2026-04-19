import { Link, useLocation } from "react-router-dom";

export default function Navbar({ user, logout }) {
  const location = useLocation();
  if (!user) return null;

  const navLink = (to, label) => (
    <Link
      to={to}
      style={{
        color: location.pathname === to ? "#1a1a2e" : "#64748b",
        textDecoration: "none",
        fontSize: "13px",
        fontWeight: "600",
        fontFamily: "'Space Mono', monospace",
        letterSpacing: "0.05em",
        padding: "4px 0",
        borderBottom: location.pathname === to ? "2px solid #6d28d9" : "2px solid transparent",
        transition: "color 0.15s, border-color 0.15s",
        textTransform: "uppercase",
      }}
    >
      {label}
    </Link>
  );

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');`}</style>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 32px",
        height: "52px",
        background: "rgba(255,255,255,0.6)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(109,40,217,0.15)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <span style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: "700",
            fontSize: "18px",
            color: "#1a1a2e",
            letterSpacing: "-0.03em",
          }}>
            CInT
          </span>
          <div style={{ display: "flex", gap: "24px" }}>
            {navLink("/", "Home")}
            {navLink("/problems", "Problems")}
            {navLink("/leaderboard", "Leaderboard")}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link to="/profile" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
            {user.photoURL && (
              <img src={user.photoURL} alt="" style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid rgba(109,40,217,0.3)" }} />
            )}
            <span style={{ color: "#475569", fontSize: "12px", fontFamily: "'Space Mono', monospace" }}>
              {user.displayName || user.email}
            </span>
          </Link>
          <button
            onClick={logout}
            style={{
              background: "transparent",
              color: "#64748b",
              border: "1px solid rgba(109,40,217,0.3)",
              padding: "4px 14px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "11px",
              fontFamily: "'Space Mono', monospace",
              fontWeight: "700",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              transition: "all 0.15s",
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "#6d28d9"; e.currentTarget.style.color = "#6d28d9"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "rgba(109,40,217,0.3)"; e.currentTarget.style.color = "#64748b"; }}
          >
            Logout
          </button>
        </div>
      </div>
    </>
  );
}