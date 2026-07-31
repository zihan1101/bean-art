import { useEffect, useState } from "react";
import ImageUploader from "./components/ImageUploader";
import PixelSettings from "./components/PixelSettings";
import PixelGrid from "./components/PixelGrid";

const allOutputSizes = Array.from(
  { length: 19 },
  (_, index) => 10 + index * 5
);

function getMaxValidOutputSize(boardSize: number) {
  const validSizes = allOutputSizes.filter(
    (size) => size <= boardSize
  );

  return validSizes[validSizes.length - 1];
}

function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState(52);
  const [outputSize, setOutputSize] = useState(50);

  useEffect(() => {
    if (outputSize > boardSize) {
      setOutputSize(getMaxValidOutputSize(boardSize));
    }
  }, [boardSize, outputSize]);

  return (
    <main>
      <header
        style={{
          background:
            "linear-gradient(160deg, var(--mat-pink), var(--bead-rose))",
          borderRadius: "0 0 32px 32px",
          padding: "44px 24px 36px",
          textAlign: "center",
          marginBottom: "32px",
          boxShadow: "0 8px 0 rgba(58, 44, 48, 0.06)",
        }}
      >
        <h1
          style={{
            fontSize: "36px",
            color: "#FFFFFF",
            letterSpacing: "-0.5px",
          }}
        >
          拼豆图纸生成器
        </h1>

        <p
          style={{
            marginTop: "10px",
            color: "rgba(255, 255, 255, 0.92)",
            fontSize: "15px",
          }}
        >
          上传照片，生成带有 MARD 色号的拼豆图纸
        </p>
      </header>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <ImageUploader
          imageUrl={imageUrl}
          onImageChange={setImageUrl}
        />

        <PixelSettings
          boardSize={boardSize}
          outputSize={outputSize}
          onBoardSizeChange={setBoardSize}
          onOutputSizeChange={setOutputSize}
        />

        <p
          style={{
            textAlign: "center",
            fontSize: "14px",
            color: "var(--ink-soft)",
          }}
        >
          当前设置：豆板大小 {boardSize} × {boardSize}，
          图纸大小 {outputSize} × {outputSize}
        </p>

        <PixelGrid
          imageUrl={imageUrl}
          boardSize={boardSize}
          outputSize={outputSize}
        />
      </div>
    </main>
  );
}

export default App;