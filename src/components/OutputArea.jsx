const OutputPanel = ({ output }) => {
  return (
    <div style={{
      background: "#111",
      color: "#0f0",
      padding: "10px",
      height: "150px"
    }}>
      <pre>{output}</pre>
    </div>
  );
};

export default OutputPanel;