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
    <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" data-testid="header-title">
            {title}
          </h2>
          {subtitle && (
            <p className="text-neutral" data-testid="header-subtitle">
              {subtitle}
            </p>
          )}
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <Link href="/notificaciones">
            <button 
              className="p-2 text-neutral hover:text-gray-900 transition-colors relative"
              data-testid="button-notifications"
            >
              <i className="fas fa-bell text-xl"></i>
              {unreadCount > 0 && (
                <span 
                  className="absolute -top-1 -right-1 bg-danger text-white text-xs w-5 h-5 rounded-full flex items-center justify-center"
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
                  className="bg-primary text-white hover:bg-primary-dark"
                  data-testid="header-action-button"
                >
                  <i className="fas fa-plus align-middle"></i>
                  {action.label}
                </Button>
              </Link>
            ) : (
              <Button 
                onClick={action.onClick}
                className="bg-primary text-white hover:bg-primary-dark"
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
