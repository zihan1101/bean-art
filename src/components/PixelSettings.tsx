type PixelSettingsProps = {
  boardSize: number;
  outputSize: number;
  onBoardSizeChange: (size: number) => void;
  onOutputSizeChange: (size: number) => void;
};

const boardSizes = [
  { label: "小", size: 52 },
  { label: "中", size: 78 },
  { label: "大", size: 104 },
];

const allOutputSizes = Array.from(
  { length: 19 },
  (_, index) => 10 + index * 5
);

const selectStyle: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: "999px",
  border: "1px solid var(--border-soft)",
  background: "#FFFFFF",
  fontFamily: "var(--font-body)",
  fontSize: "14px",
  color: "var(--ink)",
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  marginBottom: "6px",
  color: "var(--ink-soft)",
};

function PixelSettings({
  boardSize,
  outputSize,
  onBoardSizeChange,
  onOutputSizeChange,
}: PixelSettingsProps) {
  const availableOutputSizes = allOutputSizes.filter(
    (size) => size <= boardSize
  );

  return (
    <section
      style={{
        background: "var(--pegboard)",
        borderRadius: "18px",
        padding: "20px 24px",
      }}
    >
      <h2 style={{ fontSize: "18px", marginBottom: "16px" }}>
        尺寸设置
      </h2>

      <div
        style={{
          display: "flex",
          gap: "28px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <label htmlFor="board-size" style={labelStyle}>
            豆板大小
          </label>

          <select
            id="board-size"
            value={boardSize}
            onChange={(event) =>
              onBoardSizeChange(Number(event.target.value))
            }
            style={selectStyle}
          >
            {boardSizes.map((board) => (
              <option key={board.size} value={board.size}>
                {board.label} — {board.size} × {board.size}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="output-size" style={labelStyle}>
            图纸大小
          </label>

          <select
            id="output-size"
            value={outputSize}
            onChange={(event) =>
              onOutputSizeChange(Number(event.target.value))
            }
            style={selectStyle}
          >
            {availableOutputSizes.map((size) => (
              <option key={size} value={size}>
                {size} × {size}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

export default PixelSettings;