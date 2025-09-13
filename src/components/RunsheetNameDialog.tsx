import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface RunsheetNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
  title?: string;
  description?: string;
  initialName?: string;
  placeholder?: string;
  required?: boolean;
}

const RunsheetNameDialog: React.FC<RunsheetNameDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  title = "Name Your Runsheet",
  description = "Choose a descriptive name for your runsheet. This will help you identify it later.",
  initialName = "",
  placeholder = "Enter runsheet name...",
  required = true
}) => {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError("");
    }
  }, [open, initialName]);

  const validateName = (value: string): boolean => {
    const trimmedName = value.trim();
    
    if (!trimmedName) {
      setError("Runsheet name cannot be empty");
      return false;
    }

    if (trimmedName.length < 2) {
      setError("Runsheet name must be at least 2 characters long");
      return false;
    }

    if (trimmedName.length > 100) {
      setError("Runsheet name cannot exceed 100 characters");
      return false;
    }

    // Check for forbidden names
    const forbiddenNames = [
      'untitled',
      'untitled runsheet',
      'new runsheet',
      'runsheet',
      'default',
      'temp',
      'temporary'
    ];
    
    if (forbiddenNames.includes(trimmedName.toLowerCase())) {
      setError("Please choose a more descriptive name");
      return false;
    }

    // Check for only special characters or numbers
    if (!/[a-zA-Z]/.test(trimmedName)) {
      setError("Runsheet name must contain at least one letter");
      return false;
    }

    setError("");
    return true;
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (error && value.trim()) {
      validateName(value);
    }
  };

  const handleConfirm = () => {
    const trimmedName = name.trim();
    
    if (!validateName(trimmedName)) {
      return;
    }

    onConfirm(trimmedName);
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  };

  const canConfirm = name.trim().length > 0 && !error;

  return (
    <Dialog open={open} onOpenChange={required ? undefined : onOpenChange}>
      <DialogContent 
        className="sm:max-w-md"
        onPointerDownOutside={required ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={required ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title}
            {required && <span className="text-destructive">*</span>}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="runsheet-name">
              Runsheet Name {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="runsheet-name"
              placeholder={placeholder}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => validateName(name)}
              autoFocus
              className={error ? "border-destructive focus-visible:ring-destructive" : ""}
            />
          </div>
          
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        
        <DialogFooter className="gap-2">
          {!required && (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="min-w-[100px]"
          >
            {required ? "Create" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RunsheetNameDialog;