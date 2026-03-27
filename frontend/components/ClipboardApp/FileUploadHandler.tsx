import React, {
  useState,
  useEffect,
  ChangeEvent,
  useRef,
  useCallback,
} from "react";
import { useMessages } from "next-intl";
import { Input } from "@/components/ui/input";
import { Upload } from "lucide-react";
import { FileMeta, CustomFile } from "@/types/webrtc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
// Add this declaration at the top of the file to extend existing types and avoid IDE errors
declare module "@/components/ui/input" {
  interface InputProps {
    webkitdirectory?: string | boolean;
    directory?: string | boolean;
  }
}

function formatFileChosen(
  template: string,
  fileNum: number,
  folderNum: number
) {
  return template
    .replace("{fileNum}", fileNum.toString())
    .replace("{folderNum}", folderNum.toString());
}

interface FileUploadHandlerProps {
  onFilePicked: (files: CustomFile[]) => void;
}

const FileUploadHandler: React.FC<FileUploadHandlerProps> = ({
  onFilePicked,
}) => {
  const messages = useMessages();

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // File selector -- message prompt
  const [fileText, setFileText] = useState<string>(
    messages.text.fileUploadHandler.noFileChosenTip
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    setFileText(messages.text.fileUploadHandler.noFileChosenTip);
  }, [messages.text.fileUploadHandler.noFileChosenTip]);

  const handleFileChange = useCallback(
    (newFiles: CustomFile[]) => {
      // console.log(newFiles);
      onFilePicked(newFiles);

      const fileNum = newFiles.length;
      const folderNum = newFiles.filter((file) => file.folderName).length;

      const choose_dis = formatFileChosen(
        messages!.text.fileUploadHandler.fileChosenTemplate,
        fileNum,
        folderNum
      );

      setFileText(choose_dis);
      setTimeout(
        () => setFileText(messages!.text.fileUploadHandler.noFileChosenTip),
        2000
      );
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
    },
    [messages, onFilePicked]
  );

  // Click to upload file processing
  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = Array.from(e.target.files);
        let files2 = [];
        for (let file of files) {
          const customFile: CustomFile = Object.assign(file, {
            fullName: file.name,
            folderName: "",
          });
          files2.push(customFile);
        }
        handleFileChange(files2);
        setIsModalOpen(false); // Close the dialog
      }
    },
    [handleFileChange]
  );
  // Click to upload folder response processing
  const handleFolderInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files_ = Array.from(e.target.files);
        let files: CustomFile[] = [];

        files_.forEach((file) => {
          // console.log('file.webkitRelativePath',file.webkitRelativePath)//[test/Gmail-773240713232313363.txt,test/link.txt,test/sub/cvat-serverless部署踩坑及部署模型测试 (1).docx,test/sub/images.jpg]
          const pathParts = file.webkitRelativePath.split("/");
          const customFile: CustomFile = Object.assign(file, {
            fullName: file.webkitRelativePath,
            folderName: pathParts[0],
          });
          files.push(customFile);
        });

        handleFileChange(files);
        setIsModalOpen(false); // Close the dialog
      }
    },
    [handleFileChange]
  );

  // Handle drag and drop area click
  const handleZoneClick = () => {
    setIsModalOpen(true);
  };
  // Handle file selection
  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  // Handle folder selection
  const handleSelectFolder = () => {
    folderInputRef.current?.click();
  };
  return (
    <>
      <div
        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer"
        onClick={handleZoneClick}
      >
        <p className="text-sm text-muted-foreground mb-4">
          {messages.text.fileUploadHandler.chooseFileTip}
        </p>
        <Upload className="h-12 w-12 mx-auto mb-4 text-primary" />
        <p className="text-sm text-muted-foreground">{fileText}</p>

        <Input
          id="file-upload"
          type="file"
          onChange={handleFileInputChange}
          multiple
          className="hidden"
          ref={fileInputRef}
        />
        <Input
          id="folder-upload"
          type="file"
          onChange={handleFolderInputChange}
          multiple
          webkitdirectory=""
          directory=""
          className="hidden"
          ref={folderInputRef}
        />
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              {messages.text.fileUploadHandler.chosenDiagTitle}
            </DialogTitle>
            <DialogDescription className="mt-2 text-muted-foreground">
              {messages.text.fileUploadHandler.chosenDiagDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-4 mt-6">
            <button
              onClick={handleSelectFile}
              className="px-4 py-2 rounded transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {messages.text.fileUploadHandler.selectFileLabel}
            </button>
            <button
              onClick={handleSelectFolder}
              className="px-4 py-2 rounded transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              {messages.text.fileUploadHandler.selectFolderLabel}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export { FileUploadHandler };
