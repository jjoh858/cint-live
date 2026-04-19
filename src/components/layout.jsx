import Sidebar from "./sidebar";

export default function Layout({ children, user, showSidebar = false, problems = [] }) {
  return (
    <div style={{ display: "flex", height: "100%", width: "100%", overflow: "hidden" }}>
      {user && showSidebar && <Sidebar problems={problems} />}
      <div style={{ flex: 1, overflow: "hidden", height: "100%", minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}