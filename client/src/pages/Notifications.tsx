import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, BellRing, CheckCheck, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useNotifications } from "@/contexts/NotificationContext";

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  type?: string;
}

export default function Notifications() {
  const queryClient = useQueryClient();
  const { fetchNotifications } = useNotifications();

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PUT", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      fetchNotifications();
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications?.filter((n) => !n.isRead) || [];
      await Promise.all(
        unread.map((n) => apiRequest("PUT", `/api/notifications/${n.id}/read`))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      fetchNotifications();
    },
  });

  const unreadCount = notifications?.filter((n) => !n.isRead).length || 0;

  return (
    <MainLayout>
      <Header
        title="Notificaciones"
        subtitle="Mantente al día con las actualizaciones de tus créditos"
      />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Header row with counter + mark all read */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-800">
                  Todas las notificaciones
                </h2>
                {unreadCount > 0 && (
                  <Badge className="bg-red-500 text-white">
                    {unreadCount} nueva{unreadCount !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                >
                  <CheckCheck className="h-4 w-4 mr-2" />
                  Marcar todas como leídas
                </Button>
              )}
            </div>

            {/* Notification list */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4 h-20" />
                  </Card>
                ))}
              </div>
            ) : !notifications || notifications.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Bell className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    No tienes notificaciones
                  </h3>
                  <p className="text-neutral">
                    Te avisaremos cuando haya actualizaciones importantes en tus solicitudes de crédito.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`flex items-start gap-4 p-4 rounded-lg border transition-all cursor-pointer ${
                      !notification.isRead
                        ? "bg-primary/5 border-primary/20 shadow-sm"
                        : "bg-card border-border opacity-75"
                    }`}
                    onClick={() => {
                      if (!notification.isRead) {
                        markReadMutation.mutate(notification.id);
                      }
                    }}
                  >
                    {/* Icon */}
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                        !notification.isRead
                          ? "bg-primary/10"
                          : "bg-muted"
                      }`}
                    >
                      {!notification.isRead ? (
                        <BellRing className="h-5 w-5 text-primary" />
                      ) : (
                        <Bell className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm font-semibold ${
                            !notification.isRead ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {notification.title}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!notification.isRead && (
                            <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                          )}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(notification.createdAt), {
                              addSuffix: true,
                              locale: es,
                            })}
                          </span>
                        </div>
                      </div>
                      <p
                        className={`text-sm mt-1 ${
                          !notification.isRead ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {notification.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </MainLayout>
    );
  }
