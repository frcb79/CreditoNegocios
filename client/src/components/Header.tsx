import { Button } from "@/components/ui/button";
import { useNotifications } from "@/contexts/NotificationContext";
import { Link } from "wouter";
import { Bell, Plus } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  children?: React.ReactNode;
}

export default function Header({ title, subtitle, action, children }: HeaderProps) {
  const { unreadCount } = useNotifications();

  return (
    <header className="bg-card shadow-2xs border-b border-border/70 px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate" data-testid="header-title">
            {title}
          </h2>
          {subtitle && (
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 truncate" data-testid="header-subtitle">
              {subtitle}
            </p>
          )}
        </div>
        
        <div className="flex items-center space-x-3 sm:space-x-4 flex-shrink-0">
          {/* Notifications */}
          <Link href="/notificaciones">
            <button 
              className="p-1.5 sm:p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors relative"
              data-testid="button-notifications"
              aria-label="Ver notificaciones"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span 
                  className="absolute -top-1 -right-1 bg-destructive text-white text-[10px] w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center font-bold"
                  data-testid="notification-badge"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </Link>

          {/* Additional children */}
          {children}

          {/* Action Button */}
          {action && (
            action.href ? (
              <Link href={action.href}>
                <Button 
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary-dark shadow-2xs h-8 text-xs font-medium"
                  data-testid="header-action-button"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {action.label}
                </Button>
              </Link>
            ) : (
              <Button 
                onClick={action.onClick}
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary-dark shadow-2xs h-8 text-xs font-medium"
                data-testid="header-action-button"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {action.label}
              </Button>
            )
          )}
        </div>
      </div>
    </header>
  );
}
