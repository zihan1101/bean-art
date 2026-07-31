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
    <section>
      <h2>上传照片</h2>

      <input
        type="file"
        accept="image/png, image/jpeg, image/webp"
        onChange={handleImageUpload}
      />

      {imageUrl && (
        <div>
          <img
            src={imageUrl}
            alt="上传的照片预览"
            style={{
              display: "block",
              maxWidth: "400px",
              maxHeight: "400px",
              marginTop: "20px",
            }}
          />
        </div>
      )}
    </section>
  );
}

export default ImageUploader;