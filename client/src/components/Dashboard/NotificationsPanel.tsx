import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/contexts/NotificationContext";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Link } from "wouter";

const notificationConfig = {
  credit_expiring: { icon: "fas fa-exclamation-triangle", color: "border-danger bg-red-50" },
  document_pending: { icon: "fas fa-file-alt", color: "border-warning bg-yellow-50" },
  credit_approved: { icon: "fas fa-check-circle", color: "border-success bg-green-50" },
  commission_received: { icon: "fas fa-dollar-sign", color: "border-primary bg-blue-50" },
  client_created: { icon: "fas fa-user-plus", color: "border-secondary bg-green-50" },
  credit_created: { icon: "fas fa-credit-card", color: "border-primary bg-blue-50" },
};

export default function NotificationsPanel() {
  const { notifications, unreadCount, markAsRead } = useNotifications();

  const recentNotifications = notifications.slice(0, 4);

  return (
    <Card className="border border-gray-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900">Notificaciones</CardTitle>
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
              <i className="fas fa-bell text-4xl text-gray-300 mb-4"></i>
              <p className="text-neutral">No hay notificaciones</p>
            </div>
          ) : (
            recentNotifications.map((notification) => {
              const config = notificationConfig[notification.type as keyof typeof notificationConfig] || {
                icon: "fas fa-info-circle",
                color: "border-gray-200 bg-gray-50"
              };
              
              return (
                <div 
                  key={notification.id}
                  className={`p-3 border-l-4 rounded ${config.color} ${!notification.isRead ? 'bg-opacity-75' : 'bg-opacity-50'}`}
                  onClick={() => !notification.isRead && markAsRead(notification.id)}
                  data-testid={`notification-${notification.id}`}
                >
                  <div className="flex items-start space-x-3">
                    <i className={`${config.icon} text-sm mt-0.5`}></i>
                    <div className="flex-1">
                      <p className={`font-medium text-gray-900 text-sm ${!notification.isRead ? 'font-semibold' : ''}`}>
                        {notification.title}
                      </p>
                      <p className="text-sm text-gray-600">
                        {notification.message}
                      </p>
                      <p className="text-xs text-neutral mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt!), { 
                          addSuffix: true, 
                          locale: es 
                        })}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          
          <Link href="/notificaciones">
            <Button 
              variant="ghost" 
              className="w-full text-center text-primary hover:text-primary-dark pt-2 border-t border-gray-200"
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
