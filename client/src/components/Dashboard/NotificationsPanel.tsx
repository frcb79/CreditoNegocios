import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/contexts/NotificationContext";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Link } from "wouter";

const notificationConfig: Record<string, { icon: string; border: string; bg: string; iconColor: string }> = {
  credit_expiring: { icon: "fas fa-exclamation-triangle", border: "border-danger", bg: "bg-danger/5", iconColor: "text-danger" },
  document_pending: { icon: "fas fa-file-alt", border: "border-warning", bg: "bg-warning/5", iconColor: "text-warning" },
  credit_approved: { icon: "fas fa-check-circle", border: "border-success", bg: "bg-success/5", iconColor: "text-success" },
  commission_received: { icon: "fas fa-dollar-sign", border: "border-primary", bg: "bg-primary/5", iconColor: "text-primary" },
  client_created: { icon: "fas fa-user-plus", border: "border-secondary", bg: "bg-secondary/5", iconColor: "text-secondary" },
  credit_created: { icon: "fas fa-credit-card", border: "border-primary", bg: "bg-primary/5", iconColor: "text-primary" },
};

export default function NotificationsPanel() {
  const { notifications, unreadCount, markAsRead } = useNotifications();

  const recentNotifications = notifications.slice(0, 4);

  return (
    <Card className="border border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground">Notificaciones</CardTitle>
          <Badge 
            variant="destructive" 
            className="bg-danger text-white"
            data-testid="notification-count"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentNotifications.length === 0 ? (
            <div className="text-center py-8">
              <i className="fas fa-bell text-4xl text-muted-foreground/30 mb-4"></i>
              <p className="text-muted-foreground">No hay notificaciones</p>
            </div>
          ) : (
            recentNotifications.map((notification) => {
              const config = notificationConfig[notification.type as keyof typeof notificationConfig] || {
                icon: "fas fa-info-circle",
                border: "border-border",
                bg: "bg-muted/40",
                iconColor: "text-muted-foreground"
              };
              
              return (
                <div 
                  key={notification.id}
                  className={`p-3 border-l-4 rounded ${config.border} ${config.bg} cursor-pointer transition-colors hover:bg-muted/60`}
                  onClick={() => !notification.isRead && markAsRead(notification.id)}
                  data-testid={`notification-${notification.id}`}
                >
                  <div className="flex items-start space-x-3">
                    <i className={`${config.icon} ${config.iconColor} text-sm mt-0.5`}></i>
                    <div className="flex-1">
                      <p className={`font-medium text-foreground text-sm ${!notification.isRead ? 'font-semibold' : ''}`}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {notification.message}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt!), { 
                          addSuffix: true, 
                          locale: es 
                        })}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0"></div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          
          <Link href="/notificaciones">
            <Button 
              variant="ghost" 
              className="w-full text-center text-primary hover:text-primary-dark pt-2 border-t border-border font-medium"
              data-testid="button-view-all-notifications"
            >
              Ver todas las notificaciones
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
