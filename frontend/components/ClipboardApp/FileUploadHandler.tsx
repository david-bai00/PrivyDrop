import React, { useState, useEffect, ChangeEvent, useRef, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Upload } from 'lucide-react';
import {FileMeta,CustomFile } from '@/types/webrtc';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
// 在文件顶部添加这个声明来扩展已有的类型,避免IDE报错
declare module "@/components/ui/input" {
  interface InputProps {
    webkitdirectory?: string | boolean;
    directory?: string | boolean;
  }
}

import { getDictionary } from '@/lib/dictionary';
import { useLocale } from '@/hooks/useLocale';
import type { Messages } from '@/types/messages';
import { en } from '@/constants/messages/en';  // 导入英文字典作为默认值

const traverseFileTree = async (item: FileSystemEntry, path = ''): Promise<CustomFile[]> => {
  return new Promise((resolve) => {
    // console.log('path',path)//path in ['','test/','test/sub/']
    if (item.isFile) {
      (item as FileSystemFileEntry).file((file: File) => {
        // console.log('file.name',file.name)//file.name in ['Gmail-773240713232313363.txt','link.txt','cvat-serverless部署踩坑及部署模型测试 (1).docx','images.jpg']
        // console.log('fullName',path + file.name,'folderName',path.split('/')[0])
        const customFile: CustomFile = Object.assign(file, { fullName: path + file.name, folderName: path.split('/')[0] });
        resolve([customFile]);
      });
    } else if (item.isDirectory) {
      const dirReader = (item as FileSystemDirectoryEntry).createReader();
      let entries: FileSystemEntry[] = [];

      const readEntries = () => {
        dirReader.readEntries(async (results) => {
          if (results.length) {
            entries = entries.concat(Array.from(results));
            readEntries();
          } else {
            const newPath = path + item.name + '/';
            const subResults = await Promise.all(
              entries.map((entry) => traverseFileTree(entry, newPath))
            );
            // console.log('subResults',subResults)
            const files: CustomFile[] = subResults.flat();
            // console.log('files',files)
            resolve(files); // 移除了条件判断，直接返回处理好的文件
          }
        });
      };

      readEntries();
    }
  });
};

function formatFileChosen(
  template: string, 
  fileNum: number, 
  folderNum: number
) {
  return template.replace('{fileNum}', fileNum.toString())
                .replace('{folderNum}', folderNum.toString());
}

interface FileUploadHandlerProps {
  onFilePicked: (files: CustomFile[]) => void;
}

const FileUploadHandler: React.FC<FileUploadHandlerProps> = ({ 
  onFilePicked
  }) => {
  const locale = useLocale();
  const [messages, setMessages] = useState<Messages>(en); // 使用英文字典作为初始值
  
  const dropZoneRef = useRef<HTMLDivElement>(null);//拖拽文件至附件--支持
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 文件选择器--消息提示
  const [fileText, setFileText] = useState<string>(en.text.fileUploadHandler.NoFileChosen_tips);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  useEffect(() => {
    if (locale !== 'en') {  // 如果不是英文，才需要加载其他语言包
      getDictionary(locale)
        .then(dict => {setMessages(dict);setFileText(dict.text.fileUploadHandler.NoFileChosen_tips);})
        .catch(error => console.error('Failed to load messages:', error));
    }
  }, [locale]);

  const handleFileChange = useCallback((newFiles: CustomFile[]) => {
      // console.log(newFiles);
      onFilePicked(newFiles);

      const fileNum = newFiles.length;
      const folderNum = newFiles.filter(file => file.folderName).length;
      
      // 使用时
      const choose_dis = formatFileChosen(
        messages!.text.fileUploadHandler.fileChosen_tips_template, fileNum, folderNum
      );
      
      setFileText(choose_dis);
      setTimeout(() => setFileText(messages!.text.fileUploadHandler.NoFileChosen_tips), 2000);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }, [messages,onFilePicked]);
  //拖拽上传文件夹 响应处理
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
  
      const items = e.dataTransfer.items;
      if (items) {
        const itemsArray = Array.from(items);
        Promise.all(itemsArray.map(item => {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            return traverseFileTree(entry);
          }
          return Promise.resolve([]);
        })).then(results => {
          const allFiles = results.flat();
          handleFileChange(allFiles);
        });
      }
    }, [handleFileChange]);
  /*  定义一个处理拖动文件悬停事件的回调函数 handleDragOver。
      在 handleDragOver 中，阻止默认行为和事件传播，以确保自定义处理。
      没有依赖项数组，这意味着 handleDragOver 函数只会在组件第一次渲染时创建一次，并且不会在之后的渲染中重新创建
    */
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  //点击上传文件 处理
  const handleFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      let files2 = [];
      for(let file of files){
        const customFile: CustomFile = Object.assign(file, { fullName: file.name, folderName: '' });
        files2.push(customFile);
      }
      handleFileChange(files2);
      setIsModalOpen(false);//关闭对话框
    }
  }, [handleFileChange]);
  //点击上传文件夹 响应处理
  const handleFolderInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files_ = Array.from(e.target.files);
      let files:CustomFile[] = [];

      files_.forEach(file => {
        // console.log('file.webkitRelativePath',file.webkitRelativePath)//[test/Gmail-773240713232313363.txt,test/link.txt,test/sub/cvat-serverless部署踩坑及部署模型测试 (1).docx,test/sub/images.jpg]
        const pathParts = file.webkitRelativePath.split('/');
        const customFile: CustomFile = Object.assign(file, { fullName: file.webkitRelativePath, folderName: pathParts[0] });
        files.push(customFile);
      });

      handleFileChange(files);
      setIsModalOpen(false);//关闭对话框
    }
  }, [handleFileChange]);

  // 处理拖放区域的点击
  const handleZoneClick = () => {
    setIsModalOpen(true);
  };
  // 处理选择文件
  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  // 处理选择文件夹
  const handleSelectFolder = () => {
    folderInputRef.current?.click();
  };
  if (messages === null) {
    return <div>Loading...</div>;
  }
  return (
    <>
      <div
        ref={dropZoneRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer"
        onClick={handleZoneClick}
        >
          <p className="text-sm text-gray-600 mb-4">
            {messages.text.fileUploadHandler.Drag_tips}
          </p>
        <Upload className="h-12 w-12 mx-auto mb-4 text-blue-500" />
        <p className="text-sm text-gray-600">{fileText}</p>
          
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
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              {messages.text.fileUploadHandler.SelectFile_dis}
            </button>
            <button
              onClick={handleSelectFolder}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            >
              {messages.text.fileUploadHandler.SelectFolder_dis}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export { FileUploadHandler };