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
      <h1>拼豆图纸生成器</h1>

      <p>
        上传照片，生成带有 MARD 色号的拼豆图纸。
      </p>

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

      <p>
        当前设置：豆板大小 {boardSize} × {boardSize}，
        图纸大小 {outputSize} × {outputSize}
      </p>

      <PixelGrid
        imageUrl={imageUrl}
        boardSize={boardSize}
        outputSize={outputSize}
      />
    </main>
  );
}

export default App;