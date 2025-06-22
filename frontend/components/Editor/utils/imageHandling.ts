export const handleImageUpload = (
  file: File,
  onSuccess: (imgElement: HTMLImageElement) => void
) => {
  const reader = new FileReader();
  reader.onload = (event: ProgressEvent<FileReader>) => {
    if (!event.target || !event.target.result) return;
    const img = document.createElement("img");
    img.src = event.target.result as string;
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.style.margin = "10px 0";
    onSuccess(img);
  };
  reader.readAsDataURL(file);
};
