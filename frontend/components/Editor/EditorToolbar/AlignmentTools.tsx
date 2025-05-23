import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import {  AlignmentType } from '../types';

interface AlignmentToolsProps {
  alignText: (alignment: AlignmentType) => void;
}

export function AlignmentTools({ alignText }: AlignmentToolsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      <button
        className="p-1.5 hover:bg-gray-200 rounded"
        onClick={() => alignText('left')}
        title="Align left"
      >
        <AlignLeft className="w-3.5 h-3.5" />
      </button>
      <button
        className="p-1.5 hover:bg-gray-200 rounded"
        onClick={() => alignText('center')}
        title="Align center"
      >
        <AlignCenter className="w-3.5 h-3.5" />
      </button>
      <button
        className="p-1.5 hover:bg-gray-200 rounded"
        onClick={() => alignText('right')}
        title="Align right"
      >
        <AlignRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}