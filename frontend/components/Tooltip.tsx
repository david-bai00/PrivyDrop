//一个自定义封装,便于简单使用
//简单用法，使用便捷组件 
// import { Tooltip } from '@/components/Tooltip';

// <Tooltip content="这是提示内容">
//   <button>悬停查看</button>
// </Tooltip>

// // 需要更多自定义时，使用基础组件
// import {
//   Tooltip,
//   TooltipContent,
//   TooltipProvider,
//   TooltipTrigger,
// } from '@/components/ui/tooltip';

// <TooltipProvider>
//   <Tooltip>
//     <TooltipTrigger>悬停查看</TooltipTrigger>
//     <TooltipContent>
//       这是提示内容
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