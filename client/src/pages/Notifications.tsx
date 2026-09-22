import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bell,
  CheckCheck,
  Check,
  Clock,
  FileText,
  CheckCircle2,
  DollarSign,
  UserCheck,
  Layers,
  Info,
} from "lucide-react";
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

type TabFilter = "all" | "unread" | "read";

const notificationTypeConfig: Record<
  string,
  {
    icon: typeof Bell;
    badge: string;
    badgeClass: string;
    iconColor: string;
    iconBg: string;
  }
> = {
  credit_expiring: {
    icon: Clock,
    badge: "Vencimiento",
    badgeClass: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20",
    iconColor: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/10",
  },
  document_pending: {
    icon: FileText,
    badge: "Documento",
    badgeClass: "bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-500/20",
    iconColor: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-500/10",
  },
  credit_approved: {
    icon: CheckCircle2,
    badge: "Aprobación",
    badgeClass: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/10",
  },
  commission_received: {
    icon: DollarSign,
    badge: "Comisión",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
  },
  client_created: {
    icon: UserCheck,
    badge: "Cliente",
    badgeClass: "bg-slate-500/10 text-slate-800 dark:text-slate-300 border-slate-500/20",
    iconColor: "text-slate-600 dark:text-slate-400",
    iconBg: "bg-slate-500/10",
  },
  credit_created: {
    icon: Layers,
    badge: "Expediente",
    badgeClass: "bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border-indigo-500/20",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    iconBg: "bg-indigo-500/10",
  },
};

const defaultTypeConfig = {
  icon: Info,
  badge: "Aviso",
  badgeClass: "bg-muted text-muted-foreground border-border/50",
  iconColor: "text-muted-foreground",
  iconBg: "bg-muted",
};

export default function Notifications() {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
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

  const totalCount = notifications?.length || 0;
  const unreadCount = useMemo(
    () => notifications?.filter((n) => !n.isRead).length || 0,
    [notifications]
  );
  const readCount = totalCount - unreadCount;

  const filteredNotifications = useMemo(() => {
    if (!notifications) return [];
    if (activeTab === "unread") return notifications.filter((n) => !n.isRead);
    if (activeTab === "read") return notifications.filter((n) => n.isRead);
    return notifications;
  }, [notifications, activeTab]);

  return (
    <MainLayout>
      <Header
        title="Notificaciones"
        subtitle="Centro de alertas operativas y estados de expedientes"
      />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto" data-testid="notifications-main-content">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Controls Bar: Tabs + Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-border/60">
            {/* Local Filter Tabs */}
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50 text-xs w-fit">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === "all"
                    ? "bg-card text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-notifications-all"
              >
                <span>Todas</span>
                <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-mono">
                  {totalCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("unread")}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === "unread"
                    ? "bg-card text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-notifications-unread"
              >
                <span>No leídas</span>
                {unreadCount > 0 && (
                  <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-mono font-semibold">
                    {unreadCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("read")}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === "read"
                    ? "bg-card text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-notifications-read"
              >
                <span>Leídas</span>
                <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-mono">
                  {readCount}
                </span>
              </button>
            </div>

            {/* Mark all as read button */}
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-medium border-border/70 hover:bg-muted self-start sm:self-auto"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1.5 text-primary" />
                Marcar todas como leídas
              </Button>
            )}
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="border border-border/70 rounded-lg bg-card divide-y divide-border/60 overflow-hidden shadow-2xs">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-3.5 flex items-center gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-md bg-muted/60 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-muted/60 rounded w-1/3" />
                    <div className="h-3 bg-muted/40 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : !notifications || notifications.length === 0 ? (
            /* Empty State: No notifications at all */
            <Card className="border border-border/70 bg-card shadow-2xs" data-testid="notifications-empty-all">
              <CardContent className="p-8 sm:p-12 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  Bandeja al corriente
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  No tienes notificaciones registradas. Te avisaremos cuando haya actualizaciones en tus créditos.
                </p>
              </CardContent>
            </Card>
          ) : filteredNotifications.length === 0 ? (
            /* Empty State: Filter tab has no results */
            <Card className="border border-border/70 bg-card shadow-2xs" data-testid="notifications-empty-filtered">
              <CardContent className="p-8 text-center">
                <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center mx-auto mb-2.5">
                  <Check className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-xs font-semibold text-foreground">
                  {activeTab === "unread"
                    ? "No tienes notificaciones pendientes de lectura"
                    : "No hay notificaciones en este apartado"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {activeTab === "unread"
                    ? "Todas las alertas han sido revisadas."
                    : "Cambia de pestaña para consultar el historial completo."}
                </p>
              </CardContent>
            </Card>
          ) : (
            /* Compact Inbox List */
            <div
              className="border border-border/70 rounded-lg bg-card divide-y divide-border/60 overflow-hidden shadow-2xs"
              data-testid="notifications-list"
            >
              {filteredNotifications.map((notification) => {
                const cfg =
                  (notification.type && notificationTypeConfig[notification.type]) ||
                  defaultTypeConfig;
                const IconComponent = cfg.icon;

                return (
                  <div
                    key={notification.id}
                    onClick={() => {
                      if (!notification.isRead) {
                        markReadMutation.mutate(notification.id);
                      }
                    }}
                    className={`group px-3.5 py-3 flex items-start gap-3 transition-colors cursor-pointer select-none ${
                      !notification.isRead
                        ? "bg-primary/[0.03] hover:bg-primary/[0.06] border-l-2 border-l-primary"
                        : "bg-card hover:bg-muted/30 border-l-2 border-l-transparent opacity-85"
                    }`}
                    data-testid={`notification-item-${notification.id}`}
                  >
                    {/* Contextual Icon */}
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 border border-border/50 ${cfg.iconBg}`}
                    >
                      <IconComponent className={`h-3.5 w-3.5 ${cfg.iconColor}`} />
                    </div>

                    {/* Content Block */}
                    <div className="flex-1 min-w-0">
                      {/* Top Meta Line: Badge + Relative Time */}
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.2 rounded border font-medium ${cfg.badgeClass}`}
                          data-testid={`notification-badge-${notification.id}`}
                        >
                          {cfg.badge}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!notification.isRead && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"
                              title="No leída"
                              data-testid={`notification-unread-dot-${notification.id}`}
                            />
                          )}
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {formatDistanceToNow(new Date(notification.createdAt), {
                              addSuffix: true,
                              locale: es,
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Title */}
                      <p
                        className={`text-xs leading-snug break-words ${
                          !notification.isRead
                            ? "font-semibold text-foreground"
                            : "font-medium text-foreground/80"
                        }`}
                        data-testid={`notification-title-${notification.id}`}
                      >
                        {notification.title}
                      </p>

                      {/* Message body */}
                      <p
                        className={`text-[11px] leading-relaxed mt-0.5 break-words ${
                          !notification.isRead
                            ? "text-muted-foreground"
                            : "text-muted-foreground/80"
                        }`}
                        data-testid={`notification-message-${notification.id}`}
                      >
                        {notification.message}
                      </p>
                    </div>

                    {/* Mark as read quick button if unread */}
                    {!notification.isRead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          markReadMutation.mutate(notification.id);
                        }}
                        disabled={markReadMutation.isPending}
                        title="Marcar como leída"
                        aria-label="Marcar como leída"
                        className="text-muted-foreground/50 hover:text-primary p-1 rounded transition-colors self-center flex-shrink-0"
                        data-testid={`button-mark-read-${notification.id}`}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </MainLayout>
  );
}

