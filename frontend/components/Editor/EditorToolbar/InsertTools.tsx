import { Link2, Image, Code } from "lucide-react";

interface InsertToolsProps {
  insertLink: () => void;
  insertImage: () => void;
  insertCodeBlock: () => void;
}

export function InsertTools({
  insertLink,
  insertImage,
  insertCodeBlock,
}: InsertToolsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      <button
        className="p-1.5 hover:bg-gray-200 rounded"
        onClick={insertLink}
        title="Insert url"
      >
        <Link2 className="w-3.5 h-3.5" />
      </button>
      <button
        className="p-1.5 hover:bg-gray-200 rounded"
        onClick={insertImage}
        title="Upload image"
      >
        <Image className="w-3.5 h-3.5" />
      </button>
      <button
        className="p-1.5 hover:bg-gray-200 rounded"
        onClick={insertCodeBlock}
        title="Insert code"
      >
        <Code className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
