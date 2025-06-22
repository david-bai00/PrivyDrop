import React from "react";
import { SelectMenuProps } from "../types";
// Dropdown selection component
export const SelectMenu: React.FC<SelectMenuProps> = ({
  options,
  onChange,
  icon: Icon,
  placeholder,
  className,
}) => (
  <div className="relative inline-block">
    <select
      className={`appearance-none bg-transparent border rounded p-1.5 pr-6 hover:bg-gray-200 focus:outline-none ${className}`}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <div className="absolute right-1.5 top-1/2 transform -translate-y-1/2 pointer-events-none">
      <Icon className="w-3.5 h-3.5" />
    </div>
  </div>
);
