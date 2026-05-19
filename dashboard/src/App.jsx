import { useEffect, useState, useRef } from "react"
import axios from "axios"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts"

const API = window.location.origin

const cardStyle = {
  background: "#16213e",
  border: "1px solid #1a2a4a",
  borderRadius: 12,
  padding: "18px 20px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
}

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

const formatDuration = (startTs) => {
  if (!startTs) return "00:00:00"
  const diff = Math.max(0, Math.floor((Date.now() - new Date(startTs).getTime()) / 1000))
  const h = String(Math.floor(diff / 3600)).padStart(2, "0")
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0")
  const s = String(diff % 60).padStart(2, "0")
  return `${h}:${m}:${s}`
}

const formatClock = (ts) => {
  if (!ts) return ""
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts).slice(11, 16)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
}

const formatDateTime = (ts) => {
  if (!ts) return ""
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts).slice(0, 19).replace("T", " ")
  return d.toLocaleString()
}

const buildTimeline = (rows) =>
  rows.map((r, i) => ({
    snapshot: i + 1,
    focus: r.avg_focus,
    timestamp: r.timestamp,
    tick: formatClock(r.timestamp),
  }))

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#16213e",
      border: `1px solid ${color}44`,
      borderTop: `3px solid ${color}`,
      borderRadius: 12,
      padding: "16px 20px",
      flex: "1 1 180px",
      minWidth: 160,
      boxShadow: "0 10px 30px rgba(0,0,0,0.16)",
    }}>
      <div style={{
        fontSize: 10,
        color: "#666",
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 6
      }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>
        {value ?? "—"}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Badge({ text, color }) {
  return (
    <span style={{
      background: color + "22",
      color,
      border: `1px solid ${color}44`,
      borderRadius: 20,
      padding: "4px 10px",
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  )
}

function HeroStrip({ live, alerts, transcripts, sessionId, sessionInfo }) {
  const latestAlert = alerts[0]

  return (
    <div style={{
      background: "linear-gradient(135deg, #16213e 0%, #1b2d58 100%)",
      border: "1px solid #24345f",
      borderRadius: 16,
      padding: "20px 22px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 18,
      flexWrap: "wrap",
      boxShadow: "0 14px 36px rgba(0,0,0,0.22)",
    }}>
      <div style={{ flex: "1 1 320px" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 8 }}>
          Live Classroom Engagement Monitor
        </div>
        <div style={{ fontSize: 13, color: "#9fb2d9", lineHeight: 1.6 }}>
          Real-time classroom focus, behavioral alerts, and teaching analytics in one dashboard.
        </div>
        {sessionInfo?.started_at && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge text={`Session ${sessionId}`} color="#1D9E75" />
            <Badge text={`Running ${formatDuration(sessionInfo.started_at)}`} color="#7F77DD" />
            <Badge text="Detection Active" color="#378ADD" />
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Badge text={`Focus ${live?.avg_focus ?? "—"}%`} color={focusColor(live?.avg_focus)} />
        <Badge text={`Students ${live?.person_count ?? "—"}`} color="#7F77DD" />
        <Badge text={`Alerts ${alerts.length}`} color="#E24B4A" />
        <Badge text={`Q-ratio ${transcripts[0]?.q_ratio ?? "—"}`} color="#EF9F27" />
      </div>

      <div style={{
        width: "100%",
        borderTop: "1px solid #23345a",
        paddingTop: 12,
        fontSize: 12,
        color: "#aab7d2"
      }}>
        {latestAlert ? (
          <>
            Latest event: <span style={{ color: "#fff", fontWeight: 700 }}>{alertLabel(latestAlert)}</span>
            {" — "}
            Student {latestAlert.track_id !== -1 ? latestAlert.track_id : latestAlert.person_index + 1}
            {" · "}
            {latestAlert.timestamp.slice(11, 19)}
          </>
        ) : (
          <>Latest event: No alerts yet — classroom currently stable</>
        )}
      </div>
    </div>
  )
}

function SessionHealthBar({ sessionInfo, live }) {
  const [, forceTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => forceTick(v => v + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Badge text={`Session Time ${formatDuration(sessionInfo?.started_at)}`} color="#7F77DD" />
      <Badge text="Camera Ready" color="#378ADD" />
      <Badge text="Detection Running" color="#1D9E75" />
      <Badge text={live?.person_count ? "Students Tracked" : "Waiting for students"} color="#EF9F27" />
    </div>
  )
}

function StudentHeatmap({ sessionId }) {
  const [students, setStudents] = useState([])

  useEffect(() => {
    if (!sessionId) return
    const poll = () =>
      axios.get(`${API}/session/${sessionId}/heatmap`)
        .then(r => setStudents(r.data))
        .catch(() => {})
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [sessionId])

  if (students.length === 0) return (
    <div style={{ ...cardStyle, textAlign: "center", color: "#444", padding: "40px 20px" }}>
      Waiting for student tracking data...
    </div>
  )

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 16, fontWeight: 600 }}>
        STUDENT FOCUS HEATMAP — {students.length} students tracked
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {students.map(s => {
          const color = focusColor(s.avg_focus)
          return (
            <div key={s.track_id} style={{
              background: color + "22",
              border: `2px solid ${color}`,
              borderRadius: 10,
              padding: "12px 16px",
              minWidth: 110,
              position: "relative",
              flex: "1 1 120px",
            }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                Student {s.track_id}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>
                {s.avg_focus ?? "—"}%
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {s.hand_raises > 0 && (
                    <span style={{ fontSize: 13, color: "#378ADD", fontWeight: 600 }}>
                    ✋{s.hand_raises}
                    </span>
                  )}
                  {s.phone_count > 0 && (
                    <span style={{ fontSize: 13, color: "#E24B4A", fontWeight: 600 }}>
                    📱 {s.phone_count}
                    </span>
                  )}
                  {s.sleep_count > 0 && (
                    <span style={{ fontSize: 13, color: "#A32D2D", fontWeight: 600 }}>
                    💤 {s.sleep_count}
                    </span>
                  )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ClassroomSeatGrid({ sessionId }) {
  const [students, setStudents] = useState([])

  useEffect(() => {
    if (!sessionId) return
    const poll = () =>
      axios.get(`${API}/session/${sessionId}/heatmap`)
        .then(r => setStudents(r.data))
        .catch(() => {})
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [sessionId])

  const seats = Array.from({ length: 24 }, (_, i) => students[i] || null)

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 16, fontWeight: 600 }}>
        CLASSROOM SEAT MAP
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
        gap: 12,
      }}>
        {seats.map((s, i) => {
          const color = s ? focusColor(s.avg_focus) : "#2a2a4a"
          return (
            <div key={i} style={{
              background: s ? color + "22" : "#10192e",
              border: `1px solid ${color}`,
              borderRadius: 10,
              padding: "12px 10px",
              minHeight: 74,
            }}>
              <div style={{ fontSize: 10, color: "#777", marginBottom: 6 }}>
                Seat {i + 1}
              </div>
              {s ? (
                <>
                  <div style={{ fontSize: 13, color: "#ccc", marginBottom: 2 }}>Student {s.track_id}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>
                    {s.avg_focus ?? "—"}%
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "#444", paddingTop: 14 }}>Empty</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PipelineButton() {
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    const poll = () =>
      axios.get(`${API}/pipeline/status`)
        .then(r => setRunning(r.data.running))
        .catch(() => {})
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [])

  const handleStop = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const r = await axios.post(`${API}/pipeline/stop`)
      setMessage(r.data.message)
    } catch {
      setMessage("Failed to send stop signal")
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const r = await axios.post(`${API}/pipeline/start`)
      setMessage(r.data.message)
    } catch {
      setMessage("Failed to start pipeline")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {running ? (
        <button onClick={handleStop} disabled={loading} style={{
          background: "#E24B4A22",
          border: "1px solid #E24B4A",
          color: loading ? "#555" : "#E24B4A",
          borderRadius: 8,
          padding: "5px 14px",
          fontSize: 11,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer"
        }}>
          {loading ? "⏳ Stopping..." : "⏹ Stop Detection"}
        </button>
      ) : (
        <button onClick={handleStart} disabled={loading} style={{
          background: "#1D9E7522",
          border: "1px solid #1D9E75",
          color: loading ? "#555" : "#1D9E75",
          borderRadius: 8,
          padding: "5px 14px",
          fontSize: 11,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer"
        }}>
          {loading ? "⏳ Starting..." : "▶ Start Detection"}
        </button>
      )}
      {message && <span style={{ fontSize: 10, color: "#888", maxWidth: 220 }}>{message}</span>}
    </div>
  )
}

function VideoSourceButton() {
  const [config, setConfig] = useState({ video_mode: false, filename: null })
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    const fetchConfig = () =>
      axios.get(`${API}/video_config`)
        .then(r => setConfig(r.data))
        .catch(() => {})
    fetchConfig()
    const id = setInterval(fetchConfig, 5000)
    return () => clearInterval(id)
  }, [])

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setStatus(null)
    try {
      const form = new FormData()
      form.append("file", file)
      await axios.post(`${API}/video_config/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      setConfig({ video_mode: true, filename: file.name })
      setStatus("ok")
    } catch {
      setStatus("error")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const switchToCamera = async () => {
    await axios.post(`${API}/video_config/use_camera`).catch(() => {})
    setConfig({ video_mode: false, filename: null })
    setStatus(null)
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {config.video_mode ? (
        <>
          <div style={{
            background: "#EF9F2722",
            border: "1px solid #EF9F27",
            color: "#EF9F27",
            borderRadius: 8,
            padding: "5px 12px",
            fontSize: 11,
            fontWeight: 600,
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
            🎬 {config.filename ?? "Video mode"}
          </div>
          <button
            onClick={switchToCamera}
            title="Switch back to live webcam"
            style={{
              background: "#1a2a4a",
              border: "1px solid #2a3a5a",
              color: "#888",
              borderRadius: 8,
              padding: "5px 12px",
              fontSize: 11,
              cursor: "pointer"
            }}
          >
            📷 Use Camera
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              background: uploading ? "#1a2a4a" : "#16213e",
              border: "1px solid #2a3a5a",
              color: uploading ? "#555" : "#888",
              borderRadius: 8,
              padding: "5px 14px",
              fontSize: 11,
              cursor: uploading ? "not-allowed" : "pointer"
            }}
          >
            {uploading ? "⏳ Uploading..." : "🎬 Upload Video"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </>
      )}

      {status === "ok" && (
        <span style={{ fontSize: 11, color: "#1D9E75" }}>✓ Ready — restart Python to apply</span>
      )}
      {status === "error" && (
        <span style={{ fontSize: 11, color: "#E24B4A" }}>✗ Upload failed</span>
      )}
    </div>
  )
}

function LiveTab({ sessionId, showSeatGrid }) {
  const [live, setLive] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [transcripts, setTrans] = useState([])
  const [timeline, setTimeline] = useState([])
  const [sessionInfo, setSessionInfo] = useState(null)

  useEffect(() => {
    if (!sessionId) return

    axios.get(`${API}/session/${sessionId}/info`)
      .then(r => setSessionInfo(r.data))
      .catch(() => {})

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
        setTimeline(buildTimeline(tlR.data))
      } catch (e) {}
    }

    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [sessionId])

  if (!sessionId) return (
    <div style={{ color: "#555", textAlign: "center", padding: 80, fontSize: 14 }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
      <div>No active session — Python pipeline is not running.</div>
      <div style={{ fontSize: 12, marginTop: 8, color: "#444" }}>
        Run <code style={{ background: "#1a1a2e", padding: "2px 6px", borderRadius: 4 }}>python start.py</code> to begin a live session.
      </div>
      <div style={{ fontSize: 12, marginTop: 6, color: "#444" }}>
        To review past sessions, switch to the <strong style={{ color: "#888" }}>Session Analysis</strong> tab.
      </div>
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <HeroStrip
        live={live}
        alerts={alerts}
        transcripts={transcripts}
        sessionId={sessionId}
        sessionInfo={sessionInfo}
      />

      <SessionHealthBar sessionInfo={sessionInfo} live={live} />

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard label="Class focus" value={live?.avg_focus != null ? `${live.avg_focus}%` : "—"} color={focusColor(live?.avg_focus)} sub="Average all students" />
        <StatCard label="Students detected" value={live?.person_count ?? "—"} color="#7F77DD" sub="In frame now" />
        <StatCard label="Hand raises" value={alerts.filter(a => a.hand_raised).length} color="#378ADD" sub="This session" />
        <StatCard label="On phone" value={alerts.filter(a => a.phone_detected).length} color="#E24B4A" sub="Detected" />
        <StatCard label="Q-ratio" value={transcripts[0] ? transcripts[0].q_ratio : "—"} color="#EF9F27" sub="Teacher questions" />
      </div>

      {showSeatGrid ? <ClassroomSeatGrid sessionId={sessionId} /> : <StudentHeatmap sessionId={sessionId} />}

      {timeline.length > 0 ? (
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>
              CLASS FOCUS SCORE OVER TIME
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge text={`${timeline.length} snapshots`} color="#7F77DD" />
              <Badge text="1 point = 5 seconds" color="#378ADD" />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2a4a" />
              <XAxis
                dataKey="snapshot"
                stroke="#333"
                interval="preserveStartEnd"
                tickFormatter={(value, index) => {
                  const point = timeline[index]
                  if (!point) return value
                  const every = Math.max(1, Math.ceil(timeline.length / 8))
                  return index % every === 0 || index === timeline.length - 1 ? point.tick : ""
                }}
                tick={{ fill: "#555", fontSize: 10 }}
              />
              <YAxis domain={[0, 100]} stroke="#333" tick={{ fill: "#555", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: "#0f0f1a", border: "1px solid #333", borderRadius: 6, fontSize: 12 }}
                formatter={(value) => [`${value}%`, "Class focus"]}
                labelFormatter={(label, payload) => {
                  const p = payload?.[0]?.payload
                  return p ? `Snapshot ${p.snapshot} • ${formatDateTime(p.timestamp)}` : `Snapshot ${label}`
                }}
              />
              <ReferenceLine y={70} stroke="#1D9E7544" strokeDasharray="4 4" />
              <ReferenceLine y={40} stroke="#E24B4A44" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="focus" stroke="#1D9E75" strokeWidth={2} dot={{ r: 3, fill: "#1D9E75" }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ ...cardStyle, textAlign: "center", color: "#444", padding: "40px 20px" }}>
          Waiting for first data snapshot (every 5 seconds)...
        </div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 16
      }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 14, fontWeight: 600 }}>
            LIVE ALERT FEED
          </div>
          {alerts.length === 0
            ? <div style={{ color: "#444", fontSize: 13 }}>No alerts yet</div>
            : alerts.map((e, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 0",
                borderBottom: "1px solid #1a2a4a",
                fontSize: 12
              }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: alertColor(e),
                  flexShrink: 0,
                  display: "inline-block"
                }} />
                <span style={{ color: "#555", minWidth: 70 }}>{e.timestamp.slice(11, 19)}</span>
                <span style={{ color: "#ccc", flex: 1 }}>
                  {alertLabel(e)} — Student {e.track_id !== -1 ? e.track_id : e.person_index + 1}
                </span>
                <Badge text={`${e.focus_score ?? 0}%`} color={focusColor(e.focus_score)} />
              </div>
            ))
          }
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 14, fontWeight: 600 }}>
            TEACHER TRANSCRIPT
          </div>
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
  const [searchText, setSearchText] = useState("")

  useEffect(() => {
    const load = () => axios.get(`${API}/sessions/all`).then(r => setSessions(r.data))
    load()
    const id = setInterval(load, 5000)
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
      setTimeline(buildTimeline(tl.data))
      setAllEvents([...ev.data].reverse())
      setTrans(tr.data)
    })
  }, [selected])

  const filteredSessions = sessions.filter(s =>
    `${s.label} ${s.started_at}`.toLowerCase().includes(searchText.toLowerCase())
  )
  const topMatches = searchText.trim() ? filteredSessions.slice(0, 6) : []

  useEffect(() => {
  if (!searchText.trim()) return
  if (filteredSessions.length === 1) {
    setSelected(filteredSessions[0].id)
  }
}, [searchText, filteredSessions])

  const filteredEvents = allEvents.filter(e => {
    if (filter === "alerts") return e.hand_raised || e.sleeping || e.phone_detected
    if (filter === "hand") return e.hand_raised
    if (filter === "phone") return e.phone_detected
    return true
  })

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 10, fontWeight: 600 }}>
          SELECT SESSION
        </div>

        <input
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Search by professor, course, class, or date..."
          style={{
            background: "#0f0f1a",
            color: "#ccc",
            border: "1px solid #2a2a4a",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 13,
            width: "100%",
            marginBottom: 10,
            outline: "none"
          }}
        />

        {searchText.trim() && topMatches.length > 0 && (
  <div style={{
    background: "#0f0f1a",
    border: "1px solid #2a2a4a",
    borderRadius: 8,
    marginBottom: 10,
    overflow: "hidden"
  }}>
    {topMatches.map(s => (
      <button
        key={s.id}
        onClick={() => setSelected(s.id)}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          background: selected === s.id ? "#1D9E7522" : "transparent",
          color: selected === s.id ? "#fff" : "#ccc",
          border: "none",
          borderBottom: "1px solid #1a2a4a",
          padding: "10px 12px",
          fontSize: 12,
          cursor: "pointer"
        }}
      >
        Session {s.id} · {s.label} · {s.started_at.slice(0, 16).replace("T", " ")}
      </button>
    ))}
  </div>
)}

        <select
          value={selected ?? ""}
          onChange={e => setSelected(Number(e.target.value))}
          style={{
            background: "#0f0f1a",
            color: "#ccc",
            border: "1px solid #2a2a4a",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 13,
            width: "100%",
            cursor: "pointer"
          }}
        >
          <option value="">— choose a session —</option>
          {filteredSessions.map(s => (
            <option key={s.id} value={s.id}>
              Session {s.id} · {s.label} · {s.started_at.slice(0, 16).replace("T", " ")}
            </option>
          ))}
        </select>

        {searchText && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>
            {filteredSessions.length} matching session(s)
          </div>
        )}
      </div>

      {summary && (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <StatCard label="Avg class focus" value={`${summary.avg_focus}%`} color={focusColor(summary.avg_focus)} sub="Full session avg" />
            <StatCard label="Snapshots" value={timeline.length} color="#7F77DD" sub="Every 5 seconds" />
            <StatCard label="Hand raises" value={summary.total_hand_raises} color="#378ADD" sub="Total" />
            <StatCard label="Sleeping alerts" value={summary.total_sleeping} color="#A32D2D" sub="Total" />
          </div>

          {timeline.length > 0 && (
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>
                  CLASS FOCUS TIMELINE
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge text={`${timeline.length} snapshots`} color="#7F77DD" />
                  <Badge text="1 point = 5 seconds" color="#378ADD" />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2a4a" />
                  <XAxis
                    dataKey="snapshot"
                    stroke="#333"
                    interval="preserveStartEnd"
                    tickFormatter={(value, index) => {
                      const point = timeline[index]
                      if (!point) return value
                      const every = Math.max(1, Math.ceil(timeline.length / 8))
                      return index % every === 0 || index === timeline.length - 1 ? point.tick : ""
                    }}
                    tick={{ fill: "#555", fontSize: 10 }}
                  />
                  <YAxis domain={[0, 100]} stroke="#333" tick={{ fill: "#555", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "#0f0f1a", border: "1px solid #333", borderRadius: 6, fontSize: 12 }}
                    formatter={(value) => [`${value}%`, "Class focus"]}
                    labelFormatter={(label, payload) => {
                      const p = payload?.[0]?.payload
                      return p ? `Snapshot ${p.snapshot} • ${formatDateTime(p.timestamp)}` : `Snapshot ${label}`
                    }}
                  />
                  <ReferenceLine y={70} stroke="#1D9E7544" strokeDasharray="4 4" label={{ value: "Good", fill: "#1D9E7566", fontSize: 10 }} />
                  <ReferenceLine y={40} stroke="#E24B4A44" strokeDasharray="4 4" label={{ value: "Low", fill: "#E24B4A66", fontSize: 10 }} />
                  <Line type="monotone" dataKey="focus" stroke="#1D9E75" strokeWidth={2} dot={{ r: 3, fill: "#1D9E75" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {transcripts.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 14, fontWeight: 600 }}>
                TRANSCRIPT LOG
              </div>
              {transcripts.map((t, i) => (
                <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #1a2a4a" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <Badge text={`Q-ratio: ${t.q_ratio}`} color="#EF9F27" />
                    <Badge text={`${t.word_count} words`} color="#7F77DD" />
                    <Badge text={`${t.question_count} questions`} color="#378ADD" />
                    <span style={{ fontSize: 10, color: "#444", alignSelf: "center" }}>{t.timestamp.slice(0, 19)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7, fontStyle: "italic" }}>
                    "{t.transcript}"
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>FULL EVENT LOG</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["all", "All"], ["alerts", "Alerts only"], ["hand", "Hand raises"], ["phone", "Phone"]].map(([f, label]) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      background: filter === f ? "#1D9E75" : "#0f0f1a",
                      color: filter === f ? "#fff" : "#555",
                      border: "1px solid #2a2a4a",
                      borderRadius: 6,
                      padding: "3px 10px",
                      fontSize: 11,
                      cursor: "pointer"
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {filteredEvents.length === 0
                ? <div style={{ color: "#444", fontSize: 13 }}>No events match this filter</div>
                : filteredEvents.map((e, i) => (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "5px 0",
                    borderBottom: "1px solid #1a2a4a",
                    fontSize: 11
                  }}>
                    <span style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      flexShrink: 0,
                      display: "inline-block",
                      background: e.phone_detected ? "#E24B4A" : e.hand_raised ? "#378ADD" : e.sleeping ? "#A32D2D" : focusColor(e.focus_score)
                    }} />
                    <span style={{ color: "#444", minWidth: 70 }}>{e.timestamp.slice(11, 19)}</span>
                    <span style={{ color: "#888", minWidth: 60 }}>
                      Student {e.track_id !== -1 ? e.track_id : e.person_index + 1}
                    </span>
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
  const [showSeatGrid, setShowSeatGrid] = useState(true)
  const [editForm, setEditForm] = useState({ class: "", course: "", teacher: "" })
  const savedLabel = useRef(null)

  const parseLabel = (raw) => {
    const pipeIndex = raw.lastIndexOf(" | ")
    const coursePart = pipeIndex !== -1 ? raw.slice(0, pipeIndex) : raw
    const teacherPart = pipeIndex !== -1 ? raw.slice(pipeIndex + 3) : ""
    const dashIndex = coursePart.indexOf(" - ")
    const course = dashIndex !== -1 ? coursePart.slice(0, dashIndex).trim() : coursePart.trim()
    const cls = dashIndex !== -1 ? coursePart.slice(dashIndex + 3).trim() : ""
    return { course, class: cls, teacher: teacherPart.trim() }
  }

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
            savedLabel.current = raw
          }
        } else {
          setSession(null)
          setSessionLabel(null)
          savedLabel.current = null
          setEditing(false)
        }
      } catch (e) {}
    }

    check()
    const id = setInterval(check, 3000)
    return () => clearInterval(id)
  }, [])

  const openEdit = () => {
    if (savedLabel.current) {
      setEditForm(parseLabel(savedLabel.current))
    }
    setEditing(true)
  }

  const tabBtn = active => ({
    padding: "10px 24px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: active ? "#1D9E75" : "#555",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid #1D9E75" : "2px solid transparent",
  })

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f0f1a",
      color: "#e0e0e0",
      fontFamily: "system-ui, sans-serif"
    }}>
      <div style={{
        background: "#16213e",
        borderBottom: "1px solid #1a2a4a",
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 10,
        position: "sticky",
        top: 0,
        zIndex: 20,
        backdropFilter: "blur(12px)"
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>
            ClassroomAI Monitor
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
            {sessionLabel ? sessionLabel : "AI-powered classroom engagement system · BYTEHACK 2026"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setShowSeatGrid(v => !v)}
            style={{
              background: showSeatGrid ? "#378ADD22" : "#1a2a4a",
              border: `1px solid ${showSeatGrid ? "#378ADD" : "#2a3a5a"}`,
              color: showSeatGrid ? "#378ADD" : "#888",
              borderRadius: 8,
              padding: "5px 14px",
              fontSize: 11,
              cursor: "pointer"
            }}
          >
            {showSeatGrid ? "🪑 Seat Map" : "📊 Heatmap Cards"}
          </button>

          <PipelineButton />
          <VideoSourceButton />

          {sessionId && (
            <button
              onClick={openEdit}
              style={{
                background: "#1a2a4a",
                border: "1px solid #2a3a5a",
                color: "#888",
                borderRadius: 8,
                padding: "5px 14px",
                fontSize: 11,
                cursor: "pointer"
              }}
            >
              ✏️ Edit Info
            </button>
          )}

          {sessionId ? (
            <div style={{
              background: "#1D9E7522",
              border: "1px solid #1D9E75",
              color: "#1D9E75",
              borderRadius: 20,
              padding: "4px 14px",
              fontSize: 11,
              fontWeight: 600
            }}>
              ● LIVE · Session {sessionId}
            </div>
          ) : (
            <div style={{
              background: "#33333322",
              border: "1px solid #444",
              color: "#666",
              borderRadius: 20,
              padding: "4px 14px",
              fontSize: 11,
              fontWeight: 600
            }}>
              ○ OFFLINE
            </div>
          )}
        </div>
      </div>

      {editing && sessionId && (
        <div style={{
          background: "#16213e",
          borderBottom: "1px solid #1a2a4a",
          padding: "16px 32px",
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          flexWrap: "wrap"
        }}>
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
                onChange={ev => setEditForm({ ...editForm, [f.key]: ev.target.value })}
                style={{
                  background: "#0f0f1a",
                  border: "1px solid #2a2a4a",
                  borderRadius: 6,
                  padding: "7px 12px",
                  color: "#ccc",
                  fontSize: 13,
                  width: 180
                }}
              />
            </div>
          ))}

          <button
            onClick={async () => {
              const label = `${editForm.course} - ${editForm.class}`
              await axios.put(
                `${API}/session/${sessionId}/update?label=${encodeURIComponent(label)}&teacher=${encodeURIComponent(editForm.teacher)}`
              )
              const newLabel = `${label} | ${editForm.teacher}`
              setSessionLabel(newLabel)
              savedLabel.current = newLabel
              setEditing(false)
            }}
            style={{
              background: "#1D9E75",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Save
          </button>

          <button
            onClick={() => setEditing(false)}
            style={{
              background: "#1a2a4a",
              color: "#666",
              border: "1px solid #2a3a5a",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
        </div>
      )}

      <div style={{ padding: "24px 32px" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #1a2a4a", marginBottom: 24, gap: 4 }}>
          <button style={tabBtn(tab === "live")} onClick={() => setTab("live")}>Live Monitor</button>
          <button style={tabBtn(tab === "analysis")} onClick={() => setTab("analysis")}>Session Analysis</button>
        </div>

        {tab === "live" && (
          <LiveTab
            sessionId={sessionId}
            showSeatGrid={showSeatGrid}
          />
        )}

        {tab === "analysis" && <AnalysisTab />}
      </div>
    </div>
  )
}