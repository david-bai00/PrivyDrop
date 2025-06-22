// A custom wrapper for simple use
// Simple usage, use the convenience component
// import { Tooltip } from '@/components/Tooltip';

// <Tooltip content="This is the tooltip content">
//   <button>Hover to see</button>
// </Tooltip>

// When more customization is needed, use the base components
// import {
//   Tooltip,
//   TooltipContent,
//   TooltipProvider,
//   TooltipTrigger,
// } from '@/components/ui/tooltip';

// <TooltipProvider>
//   <Tooltip>
//     <TooltipTrigger>Hover to see</TooltipTrigger>
//     <TooltipContent>
//       This is the tooltip content
//     </TooltipContent>
//   </Tooltip>
// </TooltipProvider>

import React from 'react';
import {
  Tooltip as TooltipRoot,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type TooltipProps = {
  children: React.ReactNode;
  content: React.ReactNode;
  delayDuration?: number;
};

export const Tooltip: React.FC<TooltipProps> = ({ 
  children, 
  content, 
  delayDuration = 200 
}) => {
  return (
    <TooltipProvider>
      <TooltipRoot delayDuration={delayDuration}>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent className="whitespace-pre-line bg-primary text-primary-foreground text-xs">
          {content}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
};

export default Tooltip;