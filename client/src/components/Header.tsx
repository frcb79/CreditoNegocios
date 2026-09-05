import { Button } from "@/components/ui/button";
import { useNotifications } from "@/contexts/NotificationContext";
import { Link } from "wouter";

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
    <header className="bg-card shadow-sm border-b border-border px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground" data-testid="header-title">
            {title}
          </h2>
          {subtitle && (
            <p className="text-muted-foreground text-sm mt-0.5" data-testid="header-subtitle">
              {subtitle}
            </p>
          )}
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <Link href="/notificaciones">
            <button 
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors relative"
              data-testid="button-notifications"
            >
              <i className="fas fa-bell text-xl"></i>
              {unreadCount > 0 && (
                <span 
                  className="absolute -top-1 -right-1 bg-danger text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium"
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
                  className="bg-primary text-primary-foreground hover:bg-primary-dark shadow-sm"
                  data-testid="header-action-button"
                >
                  <i className="fas fa-plus mr-2"></i>
                  {action.label}
                </Button>
              </Link>
            ) : (
              <Button 
                onClick={action.onClick}
                className="bg-primary text-primary-foreground hover:bg-primary-dark shadow-sm"
                data-testid="header-action-button"
              >
                <i className="fas fa-plus mr-2"></i>
                {action.label}
              </Button>
            )
          )}
        </div>
      </div>
    </header>
  );
}
