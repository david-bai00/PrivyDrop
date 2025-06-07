import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick?: () => Promise<void> | void;
  loadingText?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
}

const AnimatedButton = React.forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({ 
    children, 
    onClick, 
    className,
    loadingText,
    icon,
    variant = 'default',
    disabled,
    ...props 
  }, ref) => {
    const [isAnimating, setIsAnimating] = useState(false);

    const handleClick = async () => {
      if (onClick) {
        setIsAnimating(true);
        try {
          await onClick();
        } finally {
          setTimeout(() => setIsAnimating(false), 500);
        }
      }
    };

    return (
      <Button
        ref={ref}
        variant={variant}
        className={cn(
          'transition-transform duration-200',
          isAnimating ? 'scale-95' : '',
          className
        )}
        onClick={handleClick}
        disabled={disabled || isAnimating}
        {...props}
      >
        {icon && <span className="mr-2">{icon}</span>}
        {isAnimating ? loadingText : children}
      </Button>
    );
  }
);

AnimatedButton.displayName = 'AnimatedButton';

export default AnimatedButton;
// 使用示例
{/* <AnimatedButton 
  onClick={handleShare}
  loadingText="Sending..."
>
  Start sending
</AnimatedButton> */}