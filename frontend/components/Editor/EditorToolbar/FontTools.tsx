import { Type, Palette } from 'lucide-react';
import { SelectMenu } from '../components/SelectMenu';
import { StyleOption,FontStyleType } from '../types';

interface FontToolsProps {
  fontFamilies: StyleOption[];
  fontSizes: StyleOption[];
  colors: StyleOption[];
  setFontStyle: (property: FontStyleType, value: string) => void;
}

export function FontTools({ fontFamilies, fontSizes, colors, setFontStyle }: FontToolsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      <SelectMenu
        options={fontFamilies}
        onChange={(value) => setFontStyle('family', value)}
        icon={Type}
        placeholder="Font"
        className="text-sm"
      />
      <SelectMenu
        options={fontSizes}
        onChange={(value) => setFontStyle('size', value)}
        icon={Type}
        placeholder="Size"
        className="text-sm w-16"
      />
      <SelectMenu
        options={colors}
        onChange={(value) => setFontStyle('color', value)}
        icon={Palette}
        placeholder="Color"
        className="text-sm w-20"
      />
    </div>
  );
}