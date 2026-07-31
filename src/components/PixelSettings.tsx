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
    <section>
      <h2>尺寸设置</h2>

      <div>
        <label htmlFor="board-size">豆板大小：</label>
        <select
          id="board-size"
          value={boardSize}
          onChange={(event) =>
            onBoardSizeChange(Number(event.target.value))
          }
        >
          {boardSizes.map((board) => (
            <option key={board.size} value={board.size}>
              {board.label} — {board.size} × {board.size}
            </option>
          ))}
        </select>
      </div>

      <br />

      <div>
        <label htmlFor="output-size">图纸大小：</label>
        <select
          id="output-size"
          value={outputSize}
          onChange={(event) =>
            onOutputSizeChange(Number(event.target.value))
          }
        >
          {availableOutputSizes.map((size) => (
            <option key={size} value={size}>
              {size} × {size}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

export default PixelSettings;