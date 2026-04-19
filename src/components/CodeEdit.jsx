const CodeEditor = ({ code, setCode }) => {
  return (
    <textarea
      value={code}
      onChange={(e) => setCode(e.target.value)}
      style={{
        width: "100%",
        height: "100%",
        fontFamily: "monospace",
        padding: "16px",
        boxSizing: "border-box",
        resize: "none",
      }}
    />
  );
};

export default CodeEditor;