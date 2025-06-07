import React from 'react';
import {Progress } from '@/lib/types/file';

interface TransferProgressProps {
  message: string;
  progress: Progress;
}
//'Sending' : 'Receiving'
const TransferProgress: React.FC<TransferProgressProps> = ({ message, progress }) => {
  const speed = isNaN(progress.speed) ? 0 : progress.speed;

  return (
    <span className="mr-2 text-sm whitespace-nowrap">
      {message}
      <span className="inline-block min-w-[80px] text-right">
        {(speed/1024).toFixed(2)} MB/s
      </span>
      <span className="inline-block min-w-[50px] text-right">
        {(progress.progress * 100).toFixed(0).padStart(2, '0')}%
      </span>
    </span>
  );
};

export default TransferProgress;
