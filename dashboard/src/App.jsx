import { useEffect, useState } from "react"
import axios from "axios"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts"

const API = window.location.origin

const focusColor = s =>
  !s && s !== 0 ? "#555" : s >= 70 ? "#1D9E75" : s >= 40 ? "#EF9F27" : "#E24B4A"

const alertColor = e =>
  e.phone_detected ? "#E24B4A" :
    e.hand_raised ? "#378ADD" :
      e.sleeping ? "#A32D2D" : "#555"

const alertLabel = e =>
  e.phone_detected ? "On phone" :
    e.hand_raised ? "Hand raised" :
      e.sleeping ? "Sleeping" : "Event"

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#16213e", border: `1px solid ${color}44`,
      borderTop: `3px solid ${color}`, borderRadius: 10,
      padding: "16px 20px", flex: 1, minWidth: 130,
    }}>
      <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Badge({ text, color }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
    }}>{text}</span>
  )
}

function LiveTab({ sessionId }) {
  const [live, setLive] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [transcripts, setTrans] = useState([])
  const [timeline, setTimeline] = useState([])

  useEffect(() => {
    if (!sessionId) return
    const poll = async () => {
      try {
        const [liveR, alR, trR, tlR] = await Promise.all([
          axios.get(`${API}/session/${sessionId}/live`),
          axios.get(`${API}/session/${sessionId}/alerts`),
          axios.get(`${API}/session/${sessionId}/transcripts`),
          axios.get(`${API}/session/${sessionId}/focus_over_time`),
        ])
        setLive(liveR.data)
        setAlerts(alR.data.slice(0, 20))
        setTrans(trR.data.slice(0, 5))
        setTimeline(tlR.data.map((r, i) => ({ t: i + 1, focus: r.avg_focus })))
      } catch (e) { }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [sessionId])

  if (!sessionId) return (
    <div style={{ color: "#555", textAlign: "center", padding: 80, fontSize: 14 }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
      <div>Waiting for Python pipeline to start...</div>
      <div style={{ fontSize: 12, marginTop: 8, color: "#444" }}>
        Run <code style={{ background: "#1a1a2e", padding: "2px 6px", borderRadius: 4 }}>python start.py</code> to begin
      </div>
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard label="Class focus" value={live?.avg_focus != null ? `${live.avg_focus}%` : "—"} color={focusColor(live?.avg_focus)} sub="Average all students" />
        <StatCard label="Students detected" value={live?.person_count ?? "—"} color="#7F77DD" sub="In frame now" />
        <StatCard label="Hand raises" value={alerts.filter(a => a.hand_raised).length} color="#378ADD" sub="This session" />
        <StatCard label="On phone" value={alerts.filter(a => a.phone_detected).length} color="#E24B4A" sub="Detected" />
        <StatCard label="Q-ratio" value={transcripts[0] ? transcripts[0].q_ratio : "—"} color="#EF9F27" sub="Teacher questions" />
      </div>

      {timeline.length > 0 ? (
        <div style={{ background: "#16213e", border: "1px solid #1a2a4a", borderRadius: 10, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 14, fontWeight: 600 }}>CLASS FOCUS SCORE OVER TIME</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2a4a" />
              <XAxis dataKey="t" stroke="#333" tick={{ fill: "#555", fontSize: 10 }} />
              <YAxis domain={[0, 100]} stroke="#333" tick={{ fill: "#555", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0f0f1a", border: "1px solid #333", borderRadius: 6, fontSize: 12 }} />
              <ReferenceLine y={70} stroke="#1D9E7544" strokeDasharray="4 4" />
              <ReferenceLine y={40} stroke="#E24B4A44" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="focus" stroke="#1D9E75" strokeWidth={2} dot={{ r: 3, fill: "#1D9E75" }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ background: "#16213e", border: "1px solid #1a2a4a", borderRadius: 10, padding: "40px 20px", textAlign: "center", color: "#444" }}>
          Waiting for first data snapshot (every 5 seconds)...
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "#16213e", border: "1px solid #1a2a4a", borderRadius: 10, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 14, fontWeight: 600 }}>LIVE ALERT FEED</div>
          {alerts.length === 0
            ? <div style={{ color: "#444", fontSize: 13 }}>No alerts yet</div>
            : alerts.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #1a2a4a", fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: alertColor(e), flexShrink: 0, display: "inline-block" }} />
                <span style={{ color: "#555", minWidth: 70 }}>{e.timestamp.slice(11, 19)}</span>
                <span style={{ color: "#ccc", flex: 1 }}>{alertLabel(e)} — Person {e.person_index + 1}</span>
                <Badge text={`${e.focus_score ?? 0}%`} color={focusColor(e.focus_score)} />
              </div>
            ))
          }
        </div>

        <div style={{ background: "#16213e", border: "1px solid #1a2a4a", borderRadius: 10, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 14, fontWeight: 600 }}>TEACHER TRANSCRIPT</div>
          {transcripts.length === 0
            ? <div style={{ color: "#444", fontSize: 13 }}>Waiting for audio chunk (every 30s)...</div>
            : transcripts.map((t, i) => (
              <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #1a2a4a" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <Badge text={`Q-ratio: ${t.q_ratio}`} color="#EF9F27" />
                  <Badge text={`${t.word_count} words`} color="#7F77DD" />
                  <Badge text={`${t.question_count} questions`} color="#378ADD" />
                </div>
                <div style={{ fontSize: 11, color: "#666", lineHeight: 1.6 }}>
                  {t.transcript.slice(0, 180)}{t.transcript.length > 180 ? "..." : ""}
                </div>
                <div style={{ fontSize: 10, color: "#444", marginTop: 4 }}>{t.timestamp.slice(0, 19)}</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

function AnalysisTab() {
  const [sessions, setSessions] = useState([])
  const [selected, setSelected] = useState(null)
  const [summary, setSummary] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [allEvents, setAllEvents] = useState([])
  const [transcripts, setTrans] = useState([])
  const [filter, setFilter] = useState("all")

  useEffect(() => {
    axios.get(`${API}/sessions/all`).then(r => setSessions(r.data))
    const id = setInterval(() => {
      axios.get(`${API}/sessions/all`).then(r => setSessions(r.data))
    }, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!selected) return
    Promise.all([
      axios.get(`${API}/session/${selected}/summary`),
      axios.get(`${API}/session/${selected}/focus_over_time`),
      axios.get(`${API}/session/${selected}/events`),
      axios.get(`${API}/session/${selected}/transcripts`),
    ]).then(([s, tl, ev, tr]) => {
      setSummary(s.data)
      setTimeline(tl.data.map((r, i) => ({ t: i + 1, focus: r.avg_focus })))
      setAllEvents([...ev.data].reverse())
      setTrans(tr.data)
    })
  }, [selected])

  const filteredEvents = allEvents.filter(e => {
    if (filter === "alerts") return e.hand_raised || e.sleeping || e.phone_detected
    if (filter === "hand") return e.hand_raised
    if (filter === "phone") return e.phone_detected
    return true
  })

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "#16213e", border: "1px solid #1a2a4a", borderRadius: 10, padding: "18px 20px" }}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 10, fontWeight: 600 }}>SELECT SESSION</div>
        <select
          value={selected ?? ""}
          onChange={e => setSelected(Number(e.target.value))}
          style={{ background: "#0f0f1a", color: "#ccc", border: "1px solid #2a2a4a", borderRadius: 6, padding: "8px 12px", fontSize: 13, width: "100%", cursor: "pointer" }}
        >
          <option value="">— choose a session —</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              Session {s.id} · {s.label} · {s.started_at.slice(0, 16).replace("T", " ")}
            </option>
          ))}
        </select>
      </div>

      {summary && (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <StatCard label="Avg class focus" value={`${summary.avg_focus}%`} color={focusColor(summary.avg_focus)} sub="Full session avg" />
            <StatCard label="Snapshots" value={summary.total_events} color="#7F77DD" sub="Every 5 seconds" />
            <StatCard label="Hand raises" value={summary.total_hand_raises} color="#378ADD" sub="Total" />
            <StatCard label="Sleeping alerts" value={summary.total_sleeping} color="#A32D2D" sub="Total" />
          </div>

          {timeline.length > 0 && (
            <div style={{ background: "#16213e", border: "1px solid #1a2a4a", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 14, fontWeight: 600 }}>CLASS FOCUS TIMELINE</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2a4a" />
                  <XAxis dataKey="t" stroke="#333" tick={{ fill: "#555", fontSize: 10 }} />
                  <YAxis domain={[0, 100]} stroke="#333" tick={{ fill: "#555", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#0f0f1a", border: "1px solid #333", borderRadius: 6, fontSize: 12 }} />
                  <ReferenceLine y={70} stroke="#1D9E7544" strokeDasharray="4 4" label={{ value: "Good", fill: "#1D9E7566", fontSize: 10 }} />
                  <ReferenceLine y={40} stroke="#E24B4A44" strokeDasharray="4 4" label={{ value: "Low", fill: "#E24B4A66", fontSize: 10 }} />
                  <Line type="monotone" dataKey="focus" stroke="#1D9E75" strokeWidth={2} dot={{ r: 3, fill: "#1D9E75" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {transcripts.length > 0 && (
            <div style={{ background: "#16213e", border: "1px solid #1a2a4a", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 14, fontWeight: 600 }}>TRANSCRIPT LOG</div>
              {transcripts.map((t, i) => (
                <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #1a2a4a" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <Badge text={`Q-ratio: ${t.q_ratio}`} color="#EF9F27" />
                    <Badge text={`${t.word_count} words`} color="#7F77DD" />
                    <Badge text={`${t.question_count} questions`} color="#378ADD" />
                    <span style={{ fontSize: 10, color: "#444", alignSelf: "center" }}>{t.timestamp.slice(0, 19)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7, fontStyle: "italic" }}>"{t.transcript}"</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: "#16213e", border: "1px solid #1a2a4a", borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>FULL EVENT LOG</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["all", "All"], ["alerts", "Alerts only"], ["hand", "Hand raises"], ["phone", "Phone"]].map(([f, label]) => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    background: filter === f ? "#1D9E75" : "#0f0f1a",
                    color: filter === f ? "#fff" : "#555",
                    border: "1px solid #2a2a4a", borderRadius: 6,
                    padding: "3px 10px", fontSize: 11, cursor: "pointer"
                  }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {filteredEvents.length === 0
                ? <div style={{ color: "#444", fontSize: 13 }}>No events match this filter</div>
                : filteredEvents.map((e, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: "1px solid #1a2a4a", fontSize: 11 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block",
                      background: e.phone_detected ? "#E24B4A" : e.hand_raised ? "#378ADD" : e.sleeping ? "#A32D2D" : focusColor(e.focus_score)
                    }} />
                    <span style={{ color: "#444", minWidth: 70 }}>{e.timestamp.slice(11, 19)}</span>
                    <span style={{ color: "#888", minWidth: 60 }}>Person {e.person_index + 1}</span>
                    <span style={{ color: "#ccc", flex: 1 }}>
                      {e.phone_detected ? "On phone" : e.hand_raised ? "Hand raised" : e.sleeping ? "Sleeping" : `Focus ${e.focus_score}%`}
                    </span>
                    <Badge text={`${e.focus_score ?? 0}%`} color={focusColor(e.focus_score ?? 0)} />
                  </div>
                ))
              }
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState("live")
  const [sessionId, setSession] = useState(null)
  const [sessionLabel, setSessionLabel] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ class: "", course: "", teacher: "" })

  useEffect(() => {
    const check = async () => {
      try {
        const r = await axios.get(`${API}/active_session`)
        if (r.data.active && r.data.session_id) {
          const sid = r.data.session_id
          setSession(sid)
          const info = await axios.get(`${API}/session/${sid}/info`)
          if (info.data && info.data.label) {
            const raw = info.data.label
            setSessionLabel(raw)
            const parts = raw.split(" | ")
            const coursePart = parts[0] || ""
            const teacherPart = parts[1] || ""
            const courseSplit = coursePart.split(" - ")
            setEditForm({
              course:  courseSplit[0]?.trim() || "",
              class:   courseSplit[1]?.trim() || "",
              teacher: teacherPart.trim(),
            })
          }
        } else {
          setSession(null)
          setSessionLabel(null)
        }
      } catch (e) { }
    }
    check()
    const id = setInterval(check, 3000)
    return () => clearInterval(id)
  }, [])

  const tabBtn = active => ({
    padding: "10px 24px", cursor: "pointer", fontSize: 13, fontWeight: 600,
    color: active ? "#1D9E75" : "#555", background: "none", border: "none",
    borderBottom: active ? "2px solid #1D9E75" : "2px solid transparent",
  })

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#e0e0e0", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#16213e", borderBottom: "1px solid #1a2a4a", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>ClassroomAI Monitor</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
            {sessionLabel ? sessionLabel : "AI-powered classroom engagement system · BYTEHACK 2026"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {sessionId && (
            <button onClick={() => setEditing(!editing)} style={{
              background: "#1a2a4a", border: "1px solid #2a3a5a",
              color: "#888", borderRadius: 8, padding: "5px 14px",
              fontSize: 11, cursor: "pointer"
            }}>✏️ Edit Info</button>
          )}
          {sessionId ? (
            <div style={{ background: "#1D9E7522", border: "1px solid #1D9E75", color: "#1D9E75", borderRadius: 20, padding: "4px 14px", fontSize: 11, fontWeight: 600 }}>
              ● LIVE · Session {sessionId}
            </div>
          ) : (
            <div style={{ background: "#33333322", border: "1px solid #444", color: "#666", borderRadius: 20, padding: "4px 14px", fontSize: 11, fontWeight: 600 }}>
              ○ OFFLINE
            </div>
          )}
        </div>
      </div>

      {/* Edit panel */}
      {editing && sessionId && (
        <div style={{ background: "#16213e", borderBottom: "1px solid #1a2a4a", padding: "16px 32px", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          {[
            { key: "course", label: "COURSE", placeholder: "e.g. CS301" },
            { key: "class", label: "CLASS / ROOM", placeholder: "e.g. Lecture Hall B" },
            { key: "teacher", label: "TEACHER NAME", placeholder: "e.g. Prof. Ahmed" },
          ].map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{f.label}</div>
              <input
                placeholder={f.placeholder}
                value={editForm[f.key]}
                onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })}
                style={{ background: "#0f0f1a", border: "1px solid #2a2a4a", borderRadius: 6, padding: "7px 12px", color: "#ccc", fontSize: 13, width: 180 }}
              />
            </div>
          ))}
          <button
            onClick={async () => {
              const label = `${editForm.course} - ${editForm.class}`
              await axios.put(`${API}/session/${sessionId}/update?label=${encodeURIComponent(label)}&teacher=${encodeURIComponent(editForm.teacher)}`)
              setSessionLabel(`${label} | ${editForm.teacher}`)
              setEditing(false)
            }}
            style={{ background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >Save</button>
          <button
            onClick={() => setEditing(false)}
            style={{ background: "#1a2a4a", color: "#666", border: "1px solid #2a3a5a", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
          >Cancel</button>
        </div>
      )}

      <div style={{ padding: "24px 32px" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #1a2a4a", marginBottom: 24, gap: 4 }}>
          <button style={tabBtn(tab === "live")} onClick={() => setTab("live")}>Live Monitor</button>
          <button style={tabBtn(tab === "analysis")} onClick={() => setTab("analysis")}>Session Analysis</button>
        </div>

        {tab === "live" && <LiveTab sessionId={sessionId} />}
        {tab === "analysis" && <AnalysisTab />}
      </div>
    </div>
  )
}