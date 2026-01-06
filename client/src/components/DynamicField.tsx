import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EstimateField } from "@shared/schema";

interface DynamicFieldProps {
  field: EstimateField;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
}

export function DynamicField({ field, value, onChange, disabled }: DynamicFieldProps) {
  const fieldId = `field-${field.fieldKey}`;
  const testId = `input-${field.fieldKey}`;

  switch (field.fieldType) {
    case 'number':
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Input
            id={fieldId}
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            disabled={disabled}
            data-testid={testId}
          />
        </div>
      );

    case 'checkbox':
      return (
        <div className="flex items-center space-x-2">
          <Checkbox
            id={fieldId}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={disabled}
            data-testid={testId}
          />
          <Label htmlFor={fieldId} className="cursor-pointer">
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
        </div>
      );

    case 'select':
      const options = (field.options as { value: string; label: string }[]) || [];
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Select
            value={value ?? ''}
            onValueChange={(val) => onChange(val === '_none' ? null : val)}
            disabled={disabled}
          >
            <SelectTrigger data-testid={testId}>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {!field.required && (
                <SelectItem value="_none">None</SelectItem>
              )}
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'text':
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Input
            id={fieldId}
            type="text"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            data-testid={testId}
          />
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Textarea
            id={fieldId}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            data-testid={testId}
          />
        </div>
      );

    default:
      return null;
  }
}

export function getDefaultFieldValue(field: EstimateField): any {
  if (field.defaultValue !== null && field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  
  switch (field.fieldType) {
    case 'number':
      return null;
    case 'checkbox':
      return false;
    case 'select':
    case 'text':
    case 'textarea':
      return null;
    default:
      return null;
  }
}
