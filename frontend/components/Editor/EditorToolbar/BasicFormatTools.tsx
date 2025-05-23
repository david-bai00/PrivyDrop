import { Bold, Italic, Underline } from 'lucide-react';
import { FormatType } from '../types';

interface BasicFormatToolsProps {
  isStyleActive: (style: string) => boolean;
  formatText: (style: FormatType) => void;
}

export function BasicFormatTools({ isStyleActive, formatText }: BasicFormatToolsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      <button
        className={`p-1.5 rounded ${isStyleActive('bold') ? 'bg-gray-200' : 'hover:bg-gray-200'}`}
        onClick={() => formatText('bold')}
        title="Bold"
      >
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button
        className={`p-1.5 rounded ${isStyleActive('italic') ? 'bg-gray-200' : 'hover:bg-gray-200'}`}
        onClick={() => formatText('italic')}
        title="Italic"
      >
        <Italic className="w-3.5 h-3.5" />
      </button>
      <button
        className={`p-1.5 rounded ${isStyleActive('underline') ? 'bg-gray-200' : 'hover:bg-gray-200'}`}
        onClick={() => formatText('underline')}
        title="Underline"
      >
        <Underline className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}