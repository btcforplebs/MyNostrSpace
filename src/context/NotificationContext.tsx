import { createContext, useContext, useState, type ReactNode } from 'react';

interface NotificationContextType {
  hasUnread: boolean;
  markAsRead: () => void;
  lastSeen: number;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [lastSeen, setLastSeen] = useState<number>(() => {
    const saved = localStorage.getItem('mynostrspace_notifications_last_seen');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [hasUnread, setHasUnread] = useState(false);

  // Note: Actual notification counting logic will be controlled by components
  // that subscribe to the same events, but we provide the "lastSeen" reference here.

  const markAsRead = () => {
    const now = Math.floor(Date.now() / 1000);
    setLastSeen(now);
    setHasUnread(false);
    localStorage.setItem('mynostrspace_notifications_last_seen', now.toString());
  };

  return (
    <NotificationContext.Provider value={{ hasUnread, markAsRead, lastSeen }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
