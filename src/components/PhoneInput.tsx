import React from 'react';

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (val: string) => void;
}

export default function PhoneInput({ value, onChange, className = '', ...props }: PhoneInputProps) {
  // Strip any non-digit characters to show only the 9 digits in the input
  let displayValue = value.replace(/\D/g, '');
  if (displayValue.startsWith('94')) {
    displayValue = displayValue.slice(2);
  } else if (displayValue.startsWith('0')) {
    displayValue = displayValue.slice(1);
  }

  // Ensure it doesn't exceed 9 digits
  displayValue = displayValue.slice(0, 9);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '').slice(0, 9);
    // When notifying parent, we ALWAYS prepend +94 
    if (rawVal) {
      onChange(`+94 ${rawVal}`);
    } else {
      onChange('');
    }
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center pl-3 pr-2 bg-slate-100 border-r border-slate-200 rounded-l-xl text-slate-600 font-bold text-sm pointer-events-none">
        +94
      </div>
      <input
        type="tel"
        value={displayValue}
        onChange={handleChange}
        placeholder="774815692"
        className="w-full pl-14 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-sm text-slate-700 placeholder-slate-400"
        maxLength={10}
        {...props}
      />
    </div>
  );
}
