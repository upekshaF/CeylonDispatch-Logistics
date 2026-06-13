import { useEffect, useRef, useState } from "react";
import { useAppState, useStore } from "../lib/mock/react.js";

const CHANNEL_LABEL: Record<string, string> = {
  in_app: "in-app",
  email: "email",
  sms: "SMS",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const store = useStore();
  const state = useAppState();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = state.notifications.filter((n) => !n.readAt).length;

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="bell" onClick={() => setOpen((s) => !s)} aria-label="Notifications">
        🔔 {unread > 0 && <span className="count">{unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="link-btn" onClick={() => store.markAllNotificationsRead()}>
                Mark all read
              </button>
            )}
          </div>
          {state.notifications.length === 0 ? (
            <div style={{ padding: 16 }} className="muted">
              No notifications yet.
            </div>
          ) : (
            state.notifications.slice(0, 30).map((n) => (
              <div
                key={n.id}
                className={"notif-item" + (n.readAt ? "" : " unread")}
                onClick={() => !n.readAt && store.markNotificationRead(n.id)}
                role="button"
              >
                <div className="t">{n.title}</div>
                <div className="b">{n.body}</div>
                <div className="row" style={{ marginTop: 4, gap: 6 }}>
                  {n.channels.map((c) => (
                    <span key={c} className="chip">
                      {CHANNEL_LABEL[c]}
                    </span>
                  ))}
                  <span className="muted">{new Date(n.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
