type ImageUploaderProps = {
  imageUrl: string | null;
  onImageChange: (url: string) => void;
};

function ImageUploader({
  imageUrl,
  onImageChange,
}: ImageUploaderProps) {
  function handleImageUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("请选择图片文件");
      return;
    }

    const url = URL.createObjectURL(file);
    onImageChange(url);
  }

  return (
    <section
      style={{
        background: "var(--paper)",
        border: "2px dashed var(--mat-pink)",
        borderRadius: "18px",
        padding: "28px 24px",
        textAlign: "center",
      }}
    >
      <h2 style={{ fontSize: "18px" }}>上传照片</h2>

      <p
        style={{
          fontSize: "13px",
          color: "var(--ink-soft)",
          marginTop: "4px",
          marginBottom: "18px",
        }}
      >
        支持 PNG / JPG / WebP
      </p>

      <label
        style={{
          display: "inline-block",
          padding: "11px 26px",
          background: "var(--bead-rose)",
          color: "#FFFFFF",
          borderRadius: "999px",
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: "14px",
          cursor: "pointer",
          boxShadow: "0 3px 0 rgba(58, 44, 48, 0.15)",
        }}
      >
        选择图片

        <input
          type="file"
          accept="image/png, image/jpeg, image/webp"
          onChange={handleImageUpload}
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
          }}
        />
      </label>

      {imageUrl && (
        <div style={{ marginTop: "22px" }}>
          <img
            src={imageUrl}
            alt="上传的照片预览"
            style={{
              display: "block",
              maxWidth: "320px",
              maxHeight: "320px",
              margin: "0 auto",
              borderRadius: "14px",
              border: "4px solid var(--pegboard)",
            }}
          />
        </div>
      )}
    </section>
  );
}

export default ImageUploader;