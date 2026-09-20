import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/contexts/NotificationContext";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Link } from "wouter";

const notificationTypeConfig: Record<string, { icon: string; badge: string; badgeClass: string; iconColor: string }> = {
  credit_expiring: {
    icon: "fas fa-clock",
    badge: "Vencimiento",
    badgeClass: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20",
    iconColor: "text-amber-600",
  },
  document_pending: {
    icon: "fas fa-file-invoice",
    badge: "Documento",
    badgeClass: "bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-500/20",
    iconColor: "text-blue-600",
  },
  credit_approved: {
    icon: "fas fa-check-circle",
    badge: "Aprobación",
    badgeClass: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20",
    iconColor: "text-emerald-600",
  },
  commission_received: {
    icon: "fas fa-dollar-sign",
    badge: "Comisión",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    iconColor: "text-primary",
  },
  client_created: {
    icon: "fas fa-user-check",
    badge: "Cliente",
    badgeClass: "bg-slate-500/10 text-slate-800 dark:text-slate-300 border-slate-500/20",
    iconColor: "text-slate-600",
  },
  credit_created: {
    icon: "fas fa-layer-group",
    badge: "Expediente",
    badgeClass: "bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border-indigo-500/20",
    iconColor: "text-indigo-600",
  },
};

export default function NotificationsPanel() {
  const { notifications, unreadCount, markAsRead } = useNotifications();
  const recentNotifications = notifications.slice(0, 5);

  return (
    <Card className="border border-border/70 bg-card shadow-2xs" data-testid="notifications-panel-card">
      <CardHeader className="p-4 pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CardTitle className="text-sm font-semibold text-foreground tracking-tight">
              Requieren atención
            </CardTitle>
            {unreadCount > 0 ? (
              <Badge
                className="bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[10px] px-1.5 py-0 font-medium"
                data-testid="notification-count"
              >
                {unreadCount > 99 ? '99+' : unreadCount} pendientes
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] text-muted-foreground border-border/60 px-1.5 py-0 font-normal"
                data-testid="notification-count"
              >
                Al día
              </Badge>
            )}
          </div>
          <Link href="/notificaciones">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 text-primary hover:text-primary-dark font-medium"
              data-testid="button-view-all-notifications"
            >
              Bandeja completa →
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <div className="space-y-2.5">
          {recentNotifications.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border/60 rounded-md">
              <i className="fas fa-check-double text-2xl text-muted-foreground/30 mb-1.5"></i>
              <p className="text-xs font-medium text-foreground">Todo al corriente</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                No tienes solicitudes ni alertas que requieran tu acción inmediata
              </p>
            </div>
          ) : (
            recentNotifications.map((notification) => {
              const cfg = notificationTypeConfig[notification.type] || {
                icon: "fas fa-info-circle",
                badge: "Aviso",
                badgeClass: "bg-muted text-muted-foreground border-border/50",
                iconColor: "text-muted-foreground",
              };

              return (
                <div
                  key={notification.id}
                  onClick={() => !notification.isRead && markAsRead(notification.id)}
                  className={`p-2.5 rounded-md border transition-colors cursor-pointer ${
                    !notification.isRead
                      ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
                      : 'border-border/50 bg-muted/20 hover:bg-muted/40'
                  }`}
                  data-testid={`notification-${notification.id}`}
                >
                  <div className="flex items-start space-x-2.5">
                    <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5 bg-card border border-border/50">
                      <i className={`${cfg.icon} ${cfg.iconColor} text-xs`}></i>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.2 rounded border font-medium ${cfg.badgeClass}`}>
                          {cfg.badge}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {formatDistanceToNow(new Date(notification.createdAt!), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </span>
                      </div>

                      <p className={`text-xs text-foreground truncate ${!notification.isRead ? 'font-semibold' : 'font-medium'}`}>
                        {notification.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                        {notification.message}
                      </p>
                    </div>

                    {!notification.isRead && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" title="No leído"></span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
