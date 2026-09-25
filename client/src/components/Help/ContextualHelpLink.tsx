import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { HelpCircle, ExternalLink, BookOpen, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextualHelpLinkProps {
  slug: string;
  label?: string;
  variant?: "link" | "button" | "badge" | "inline";
  className?: string;
  showIcon?: boolean;
}

export function ContextualHelpLink({
  slug,
  label,
  variant = "link",
  className,
  showIcon = true,
}: ContextualHelpLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();

  const { data: articles, isLoading } = useQuery<any[]>({
    queryKey: [`/api/help/articles?slug=${slug}`],
    enabled: isOpen,
    staleTime: 1000 * 60 * 10,
  });

  const article = articles && articles.length > 0 ? articles[0] : null;

  const handleOpenHelp = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
  };

  const handleNavigateToCenter = () => {
    setIsOpen(false);
    setLocation(`/ayuda?articulo=${slug}`);
  };

  return (
    <>
      {variant === "link" && (
        <button
          type="button"
          onClick={handleOpenHelp}
          data-testid={`help-link-${slug}`}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 hover:underline font-medium cursor-pointer transition-colors text-left",
            className
          )}
        >
          {showIcon && <HelpCircle className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
          <span>{label || "¿Cómo funciona esto?"}</span>
        </button>
      )}

      {variant === "inline" && (
        <button
          type="button"
          onClick={handleOpenHelp}
          data-testid={`help-link-${slug}`}
          className={cn(
            "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors",
            className
          )}
          title={label || "Ver explicación operativa"}
        >
          {showIcon && <HelpCircle className="h-3.5 w-3.5" />}
          {label && <span className="underline decoration-dotted underline-offset-2">{label}</span>}
        </button>
      )}

      {variant === "button" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenHelp}
          data-testid={`help-link-${slug}`}
          className={cn("h-8 text-xs gap-1.5", className)}
        >
          {showIcon && <BookOpen className="h-3.5 w-3.5 text-primary" />}
          <span>{label || "Ver Guía"}</span>
        </Button>
      )}

      {variant === "badge" && (
        <button
          type="button"
          onClick={handleOpenHelp}
          data-testid={`help-link-${slug}`}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer",
            className
          )}
        >
          {showIcon && <HelpCircle className="h-3 w-3" />}
          <span>{label || "Ayuda"}</span>
        </button>
      )}

      {/* Sheet lateral con el artículo contextual */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Centro de Ayuda y Reglas</span>
            </div>
            <SheetTitle className="text-lg font-bold text-foreground">
              {article?.title || label || "Ayuda Operativa"}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {article?.categoryLabel || "Manual de Operación de Crédito Negocios"}
            </SheetDescription>
          </SheetHeader>

          <div className="py-5 space-y-4">
            {isLoading ? (
              <div className="space-y-3 py-6">
                <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                <div className="h-4 bg-muted rounded animate-pulse w-full" />
                <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                <div className="h-20 bg-muted rounded animate-pulse w-full mt-4" />
              </div>
            ) : article ? (
              <div className="space-y-4">
                {article.summary && (
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-xs text-muted-foreground leading-relaxed">
                    {article.summary}
                  </div>
                )}

                <div className="text-sm text-foreground/90 space-y-3 leading-relaxed whitespace-pre-line prose prose-sm max-w-none">
                  {article.contentMarkdown}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No se encontró el artículo solicitado.
              </div>
            )}
          </div>

          <div className="pt-4 border-t flex flex-col sm:flex-row gap-2 justify-between items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="w-full sm:w-auto text-xs"
            >
              Cerrar
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleNavigateToCenter}
              className="w-full sm:w-auto text-xs gap-1.5"
            >
              <span>Ver en Centro de Ayuda</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
