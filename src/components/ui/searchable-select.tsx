"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface SearchableSelectProps {
  options: (SearchableOption | string)[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  disabled?: boolean;
  clearable?: boolean;
  size?: "sm" | "default";
  ariaLabel?: string;
  renderOption?: (option: SearchableOption, isSelected: boolean) => React.ReactNode;
}

function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Sélectionner un élément…",
  searchPlaceholder = "Rechercher ou saisir…",
  emptyMessage = "Aucun résultat trouvé.",
  className,
  triggerClassName,
  popoverClassName,
  disabled = false,
  clearable = false,
  size = "default",
  ariaLabel,
  renderOption,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Normaliser les options pour supporter string[] et SearchableOption[]
  const normalizedOptions: SearchableOption[] = React.useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === "string") {
        return { value: opt, label: opt };
      }
      return opt;
    });
  }, [options]);

  // Trouver l'option active
  const selectedOption = React.useMemo(() => {
    if (!value) return null;
    return normalizedOptions.find((o) => o.value === value) || null;
  }, [value, normalizedOptions]);

  // Filtrer les options selon la saisie (insensible à la casse et aux accents)
  const filteredOptions = React.useMemo(() => {
    const q = normalize(search);
    if (!q) return normalizedOptions;
    return normalizedOptions.filter((opt) => {
      const searchTarget = normalize(
        `${opt.label} ${opt.subLabel || ""} ${opt.badge || ""} ${opt.value}`
      );
      return searchTarget.includes(q);
    });
  }, [normalizedOptions, search]);

  // Focus automatique du champ de recherche à l'ouverture
  React.useEffect(() => {
    if (open) {
      setSearch("");
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Gestion de la sélection
  const handleSelect = (optVal: string) => {
    onValueChange(optVal);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange("");
  };

  // Largeur dynamique alignée sur le déclencheur
  const [triggerWidth, setTriggerWidth] = React.useState<number | undefined>(undefined);
  React.useEffect(() => {
    if (triggerRef.current && open) {
      setTriggerWidth(triggerRef.current.offsetWidth);
    }
  }, [open]);

  return (
    <div className={cn("relative w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel || placeholder}
            disabled={disabled}
            className={cn(
              "flex w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-left shadow-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              "disabled:cursor-not-allowed disabled:opacity-50",
              size === "sm" ? "h-8 text-xs" : "h-9 text-xs sm:text-sm",
              !selectedOption && "text-muted-foreground",
              triggerClassName
            )}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
              {selectedOption?.icon && (
                <span className="shrink-0">{selectedOption.icon}</span>
              )}
              <span className="truncate font-medium text-foreground">
                {selectedOption ? selectedOption.label : placeholder}
              </span>
              {selectedOption?.subLabel && (
                <span className="text-[11px] text-muted-foreground truncate shrink-0">
                  · {selectedOption.subLabel}
                </span>
              )}
              {selectedOption?.badge && (
                <span className="ml-1 rounded bg-muted px-1.5 py-0.2 text-[10px] font-semibold shrink-0">
                  {selectedOption.badge}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2 text-muted-foreground">
              {clearable && value && !disabled && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleClear}
                  className="rounded p-0.5 hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                  title="Effacer la sélection"
                >
                  <X className="size-3.5" />
                </span>
              )}
              <ChevronsUpDown className="size-3.5 opacity-60" />
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          style={{ width: triggerWidth ? `${Math.max(triggerWidth, 240)}px` : "auto" }}
          className={cn(
            "p-0 rounded-xl shadow-lg border border-border bg-popover text-popover-foreground overflow-hidden z-50",
            popoverClassName
          )}
        >
          {/* Barre de saisie / recherche */}
          <div className="flex items-center border-b border-border/80 px-2.5 py-2 bg-muted/40 gap-2">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-xs sm:text-sm outline-none placeholder:text-muted-foreground text-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredOptions.length > 0) {
                  e.preventDefault();
                  handleSelect(filteredOptions[0].value);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground text-xs p-0.5"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Liste déroulante filtrée */}
          <div className="max-h-60 overflow-y-auto p-1 pretty-scroll space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
                      isSelected
                        ? "bg-primary/10 text-primary font-bold dark:bg-primary/20"
                        : "hover:bg-muted text-foreground font-medium",
                      opt.disabled && "opacity-40 cursor-not-allowed pointer-events-none"
                    )}
                  >
                    {renderOption ? (
                      renderOption(opt, isSelected)
                    ) : (
                      <>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                          <div className="min-w-0 flex-1 truncate">
                            <span className="truncate">{opt.label}</span>
                            {opt.subLabel && (
                              <span className="block text-[10px] text-muted-foreground truncate">
                                {opt.subLabel}
                              </span>
                            )}
                          </div>
                          {opt.badge && (
                            <span className="shrink-0 rounded bg-muted/80 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {opt.badge}
                            </span>
                          )}
                        </div>

                        {isSelected && (
                          <Check className="size-3.5 text-primary shrink-0 ml-1.5" />
                        )}
                      </>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Pied de popover d'aide */}
          {filteredOptions.length > 5 && (
            <div className="border-t border-border/60 bg-muted/20 px-2.5 py-1 text-[10px] text-muted-foreground flex items-center justify-between">
              <span>{filteredOptions.length} élément{filteredOptions.length > 1 ? "s" : ""}</span>
              <span>Touche Entrée pour valider</span>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
