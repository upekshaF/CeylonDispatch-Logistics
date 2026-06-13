import { useState } from "react";
import { useAppState, useStore } from "../lib/mock/react.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { isEmailConfigured } from "../lib/email/resend.js";

const EMAIL_STATUS_LABEL: Record<string, string> = {
  queued: "queued",
  sent: "✓ sent",
  simulated: "simulated",
  error: "⚠ error",
};

export function Customers() {
  const state = useAppState();
  const store = useStore();
  const [selectedId, setSelectedId] = useState<number>(state.customers[0]?.id ?? 1);
  const selected = state.customers.find((c) => c.id === selectedId)!;
  const shipments = state.shipments
    .filter((s) => s.customerId === selectedId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const updates = state.notifications.filter(
    (n) => n.audience === "customer" && n.customerId === selectedId,
  );
  const emails = state.emailLog.filter((e) => e.customerId === selectedId);

  return (
    <div className="grid-main">
      <div>
        <div className="card">
          <h2>Customers</h2>
          <ul className="customer-list">
            {state.customers.map((c) => (
              <li
                key={c.id}
                className={"customer" + (c.id === selectedId ? " active" : "")}
                onClick={() => setSelectedId(c.id)}
                role="button"
              >
                <strong>{c.name}</strong>
                <div className="muted">{c.email}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Automatic updates</h2>
          <div className="muted" style={{ marginBottom: 8 }}>
            How {selected.name} gets notified when a shipment changes.
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={selected.prefs.email}
              onChange={(e) => store.setCustomerPref(selected.id, "email", e.target.checked)}
            />
            Email updates <span className="muted">({selected.email})</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={selected.prefs.sms}
              onChange={(e) => store.setCustomerPref(selected.id, "sms", e.target.checked)}
            />
            SMS updates <span className="muted">({selected.phone})</span>
          </label>
        </div>
      </div>

      <div>
        <div className="card">
          <h2>{selected.name} — shipments</h2>
          {shipments.length === 0 && <div className="muted">No shipments.</div>}
          {shipments.map((s) => (
            <CustomerShipment key={s.id} id={s.id} />
          ))}
        </div>

        <div className="card">
          <h2>Updates sent</h2>
          {updates.length === 0 && <div className="muted">Nothing sent yet.</div>}
          {updates.slice(0, 10).map((n) => (
            <div key={n.id} className="notif-item">
              <div className="t">{n.title}</div>
              <div className="b">{n.body}</div>
              <div className="row" style={{ gap: 6, marginTop: 4 }}>
                {n.channels
                  .filter((c) => c !== "in_app")
                  .map((c) => (
                    <span key={c} className="chip">
                      {c === "email" ? "📧 email" : "📱 SMS"}
                    </span>
                  ))}
                <span className="muted">{new Date(n.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Email delivery log (Resend)</h2>
          {!isEmailConfigured() && (
            <div className="attn medium" style={{ marginBottom: 8 }}>
              <strong>Simulation mode</strong>
              <div className="muted">
                No Resend API key set — add yours in{" "}
                <code>src/lib/email/config.ts</code> to send real emails.
              </div>
            </div>
          )}
          {emails.length === 0 && <div className="muted">No emails for this customer yet.</div>}
          {emails.slice(0, 10).map((e) => (
            <div key={e.id} className="notif-item">
              <div className="t">{e.subject}</div>
              <div className="b">to {e.to}</div>
              <div className="row" style={{ gap: 6, marginTop: 4 }}>
                <span className={"chip email-" + e.status}>{EMAIL_STATUS_LABEL[e.status]}</span>
                {e.detail && <span className="muted">{e.detail}</span>}
                <span className="muted">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CustomerShipment({ id }: { id: number }) {
  const state = useAppState();
  const store = useStore();
  const s = state.shipments.find((x) => x.id === id)!;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(s.scheduledFor);
  const [instr, setInstr] = useState(s.specialInstructions ?? "");
  const editable = s.status !== "delivered" && s.status !== "failed";

  return (
    <div className="cust-shipment">
      <div className="row between clickable-row" onClick={() => setOpen((v) => !v)}>
        <div>
          <code>{s.trackingId}</code> → {s.destination}
          <span className="muted"> · scheduled {s.scheduledFor}</span>
        </div>
        <StatusBadge status={s.status} />
      </div>
      {open && (
        <div className="cust-detail">
          <ul className="timeline">
            {[...s.history].reverse().map((h, i) => (
              <li key={i}>
                <StatusBadge status={h.status} />{" "}
                <span className="muted">{new Date(h.at).toLocaleString()}</span>
                {h.note && <div>{h.note}</div>}
              </li>
            ))}
          </ul>
          {s.status !== "delivered" && (
            <>
              <label>Reschedule</label>
              <div className="row">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <button className="ghost sm" onClick={() => store.reschedule(s.id, date)}>
                  Save date
                </button>
              </div>
            </>
          )}
          {editable && (
            <>
              <label>Special instructions</label>
              <div className="row">
                <input
                  value={instr}
                  onChange={(e) => setInstr(e.target.value)}
                  placeholder="e.g. Gate code 4321, leave by the side door"
                />
                <button className="ghost sm" onClick={() => store.updateInstructions(s.id, instr)}>
                  Save
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
