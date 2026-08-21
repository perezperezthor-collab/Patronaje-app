import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Scissors, User, Ruler, Heart, LogOut, ChevronRight, ChevronLeft,
  Plus, Minus, RotateCcw, Check, Lock, Mail, Eye, EyeOff,
  BookOpen, Crown, X, AlertCircle, Settings, Save, Trash2, Copy,
  ArrowUp, ArrowDown, Undo2, Redo2, MousePointer2, Type as TypeIcon,
  CircleDot, Move, ZoomIn, ZoomOut, Play, ShieldCheck, Layers,
  PenTool, Grid3x3, FolderPlus, ChevronDown, ChevronUp, Hand, Slash,
} from "lucide-react";

/* ============================================================
   TOKENS DE DISEÑO
   ============================================================ */
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');`;

const T = {
  paper: "#EDE4D2",
  surface: "#F8F3E6",
  surface2: "#FFFDF8",
  ink: "#2B2621",
  inkMuted: "#7A6F5D",
  line: "#D9CBAC",
  accent: "#B8433A",
  accentDark: "#8F332C",
  thread: "#3E6259",
  gold: "#A9813F",
};

const DEFAULT_VARIABLES = [
  { id: "cintura", label: "Contorno de cintura", unit: "cm" },
  { id: "cadera", label: "Contorno de cadera", unit: "cm" },
  { id: "alturaCadera", label: "Altura de cadera", unit: "cm" },
  { id: "largoFalda", label: "Largo de falda", unit: "cm" },
  { id: "contornoPecho", label: "Contorno de pecho", unit: "cm" },
  { id: "contornoBajoPecho", label: "Contorno de bajo pecho", unit: "cm" },
  { id: "largoTalleDelantero", label: "Largo de talle delantero", unit: "cm" },
  { id: "largoTalleEspalda", label: "Largo de talle espalda", unit: "cm" },
  { id: "anchoEspalda", label: "Ancho de espalda", unit: "cm" },
  { id: "anchoPecho", label: "Ancho de pecho", unit: "cm" },
  { id: "largoHombro", label: "Largo de hombro", unit: "cm" },
  { id: "contornoCuello", label: "Contorno de cuello", unit: "cm" },
  { id: "contornoBrazo", label: "Contorno de brazo", unit: "cm" },
  { id: "largoManga", label: "Largo de manga", unit: "cm" },
];

// Cuenta del propietario/administrador. Cámbiala por tu email y contraseña reales:
// dímelos y te los actualizo. Solo quien inicie sesión con ESTA cuenta exacta ve el panel.
const OWNER_EMAIL = "perezperezthor@gmail.com";

const CATEGORIES = [
  "Faldas", "Cuerpos", "Mangas", "Pantalones", "Vestidos",
  "Chaquetas", "Indumentaria valenciana", "Otros",
];

/* ============================================================
   CLIENTE DE SUPABASE (auth + base de datos), sin librerías externas
   ============================================================ */
const SUPABASE_URL = "https://jleqnkojlqkqbfbltxij.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_7174SfmGgrCLHXFsD-rweA_x2xk1qJs";

async function sbAuth(path, { method = "POST", body } = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch { const e = new Error("network"); e.network = true; throw e; }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && (data.error_description || data.msg || data.error)) || `Error ${res.status}`);
  return data;
}

function makeDb(token) {
  const base = `${SUPABASE_URL}/rest/v1/`;
  async function call(path, { method = "GET", body, prefer } = {}) {
    const headers = { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}` };
    if (prefer) headers["Prefer"] = prefer;
    let res;
    try { res = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }); }
    catch { const e = new Error("network"); e.network = true; throw e; }
    let data = null;
    try { data = await res.json(); } catch { /* respuesta vacía */ }
    if (!res.ok) { const e = new Error((data && (data.message || data.hint)) || `Error ${res.status}`); e.status = res.status; throw e; }
    return data;
  }
  return {
    get: (p) => call(p),
    post: (p, body) => call(p, { method: "POST", body, prefer: "return=representation" }),
    patch: (p, body) => call(p, { method: "PATCH", body, prefer: "return=representation" }),
    del: (p) => call(p, { method: "DELETE" }),
    upsert: (p, body, onConflict) => call(`${p}?on_conflict=${onConflict}`, { method: "POST", body, prefer: "resolution=merge-duplicates,return=representation" }),
  };
}

/* ============================================================
   EVALUADOR SEGURO DE FÓRMULAS
   ============================================================ */
function tokenizeFormula(src) {
  const tokens = [];
  const re = /\s*(\d+(?:[.,]\d+)?|[A-Za-zÁÉÍÓÚÑáéíóúñ_][A-Za-z0-9ÁÉÍÓÚÑáéíóúñ_]*|[+\-*/()])\s*/y;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m || m.index !== i) throw new Error("Fórmula no válida");
    tokens.push(m[1]);
    i = re.lastIndex;
  }
  return tokens;
}
function evaluateFormula(formula, vars) {
  const tokens = tokenizeFormula(formula);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function parseExpr() {
    let val = parseTerm();
    while (peek() === "+" || peek() === "-") { const op = next(); const rhs = parseTerm(); val = op === "+" ? val + rhs : val - rhs; }
    return val;
  }
  function parseTerm() {
    let val = parseFactor();
    while (peek() === "*" || peek() === "/") { const op = next(); const rhs = parseFactor(); val = op === "*" ? val * rhs : val / rhs; }
    return val;
  }
  function parseFactor() {
    if (peek() === "-") { next(); return -parseFactor(); }
    if (peek() === "(") { next(); const val = parseExpr(); if (peek() !== ")") throw new Error("Falta paréntesis de cierre"); next(); return val; }
    const tok = next();
    if (tok === undefined) throw new Error("Fórmula incompleta");
    if (/^\d/.test(tok)) return parseFloat(tok.replace(",", "."));
    if (!(tok in vars)) throw new Error(`Variable desconocida: ${tok}`);
    const v = vars[tok];
    if (v === undefined || v === null || v === "") throw new Error(`Falta la medida: ${tok}`);
    return parseFloat(v);
  }
  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("Fórmula no válida");
  if (!isFinite(result)) throw new Error("Resultado no numérico");
  return result;
}
function formatCm(n) { return `${n.toFixed(1).replace(".", ",")} cm`; }
function tryFormula(formula, vars) { try { return formatCm(evaluateFormula(formula, vars)); } catch (e) { return null; } }
function uid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  // Alternativa por si el navegador no tiene randomUUID disponible
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Reduce el tamaño de una foto elegida por el administrador antes de guardarla
// (una foto de móvil puede pesar varios MB; la dejamos ligera para que la app vaya fluida)
function resizeImageFile(file, maxDim = 700, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   ALMACENAMIENTO (guarda los datos dentro de esta misma app,
   guarda únicamente la sesión de acceso en este dispositivo)
   ============================================================ */
async function safeGet(key, shared, fallback) {
  try { const r = await window.storage.get(key, shared); return r ? JSON.parse(r.value) : fallback; }
  catch { return fallback; }
}
async function safeSet(key, value, shared) {
  try { await window.storage.set(key, JSON.stringify(value), shared); return true; }
  catch { return false; }
}

/* ============================================================
   UI BASE
   ============================================================ */
function TopBar({ title, onBack, right, dark }) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between px-4 h-14 border-b"
      style={{ background: dark ? T.ink : T.surface2, borderColor: dark ? "#000" : T.line }}>
      <div className="flex items-center gap-2 min-w-0">
        {onBack && (
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full active:bg-black/10">
            <ChevronLeft size={22} color={dark ? T.surface2 : T.ink} />
          </button>
        )}
        <h1 className="truncate text-[17px] font-semibold" style={{ color: dark ? T.surface2 : T.ink, fontFamily: "'Space Grotesk',sans-serif" }}>{title}</h1>
      </div>
      {right}
    </div>
  );
}
function BottomNav({ active, onChange }) {
  const items = [
    { id: "catalogo", label: "Patrones", icon: BookOpen },
    { id: "medidas", label: "Mis medidas", icon: Ruler },
    { id: "favoritos", label: "Favoritos", icon: Heart },
    { id: "perfil", label: "Perfil", icon: User },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 flex border-t" style={{ background: T.surface2, borderColor: T.line }}>
      {items.map((it) => {
        const Icon = it.icon; const isActive = active === it.id;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} className="flex-1 flex flex-col items-center gap-1 py-2.5">
            <Icon size={21} color={isActive ? T.accent : T.inkMuted} strokeWidth={isActive ? 2.4 : 2} />
            <span className="text-[10.5px] font-medium" style={{ color: isActive ? T.accent : T.inkMuted }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
function PrimaryButton({ children, onClick, variant = "solid", icon: Icon, disabled, type = "button" }) {
  const styles = variant === "solid" ? { background: T.accent, color: "#FFF9F0" }
    : variant === "ghost" ? { background: "transparent", color: T.ink, border: `1.5px solid ${T.line}` }
    : { background: T.thread, color: "#FFF9F0" };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 font-semibold text-[15px] active:scale-[0.98] transition disabled:opacity-50" style={styles}>
      {Icon && <Icon size={18} />}{children}
    </button>
  );
}
function TextField({ label, icon: Icon, ...props }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: T.inkMuted }}>{label}</span>
      <div className="flex items-center gap-2 rounded-xl px-3.5 h-12 border" style={{ background: T.surface2, borderColor: T.line }}>
        {Icon && <Icon size={17} color={T.inkMuted} />}
        <input {...props} className="flex-1 bg-transparent outline-none text-[15px]" style={{ color: T.ink }} />
      </div>
    </label>
  );
}

/* ============================================================
   PANTALLA: BIENVENIDA
   ============================================================ */
function WelcomeScreen({ onRegister, onLogin }) {
  return (
    <div className="min-h-screen flex flex-col px-6 pt-16 pb-10" style={{ background: T.paper }}>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 rotate-[-6deg]" style={{ background: T.accent }}>
          <Scissors size={34} color="#FFF9F0" />
        </div>
        <h1 className="text-[34px] leading-[1.05] font-bold mb-3" style={{ color: T.ink, fontFamily: "'Space Grotesk',sans-serif" }}>Patrones<br />a tu medida</h1>
        <p className="text-[15px] leading-relaxed max-w-xs" style={{ color: T.inkMuted }}>Aprende a construir tus propios patrones de confección, paso a paso, con tus medidas reales.</p>
      </div>
      <div className="flex flex-col gap-3">
        <PrimaryButton onClick={onRegister}>Crear cuenta</PrimaryButton>
        <PrimaryButton onClick={onLogin} variant="ghost">Iniciar sesión</PrimaryButton>
      </div>
    </div>
  );
}

function AuthScreen({ mode, onBack, onSuccess }) {
  const isRegister = mode === "register";
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(""); setNeedsConfirm(false);
    if (!email || !password || (isRegister && !name)) { setError("Completa todos los campos."); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    setLoading(true);
    try {
      const data = isRegister
        ? await sbAuth("signup", { body: { email: email.trim(), password, data: { name } } })
        : await sbAuth("token?grant_type=password", { body: { email: email.trim(), password } });

      if (!data.access_token) {
        // Cuenta creada pero pendiente de confirmar por email (según la configuración de Supabase)
        setNeedsConfirm(true);
        setLoading(false);
        return;
      }
      const db = makeDb(data.access_token);
      const rows = await db.get(`profiles?id=eq.${data.user.id}&select=*`);
      const profileRow = rows[0];
      onSuccess({ token: data.access_token, refreshToken: data.refresh_token, profile: profileRow });
    } catch (err) {
      setError(err.network ? "No se pudo conectar. Revisa tu conexión a internet." : (err.message || "Ha ocurrido un error."));
    }
    setLoading(false);
  };

  if (needsConfirm) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: T.paper }}>
        <TopBar title="Revisa tu email" onBack={onBack} />
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3">
          <Mail size={30} color={T.thread} />
          <p className="text-[15px] font-semibold" style={{ color: T.ink }}>Te hemos enviado un correo</p>
          <p className="text-[13.5px]" style={{ color: T.inkMuted }}>Abre el enlace de confirmación que te ha llegado a {email}, y después inicia sesión aquí.</p>
          <button onClick={onBack} className="mt-2 text-[13.5px] font-semibold" style={{ color: T.thread }}>Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: T.paper }}>
      <TopBar title={isRegister ? "Crear cuenta" : "Iniciar sesión"} onBack={onBack} />
      <div className="flex-1 flex flex-col px-6 pt-6 gap-4">
        {isRegister && <TextField label="Nombre" icon={User} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />}
        <TextField label="Email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
        <label className="block">
          <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: T.inkMuted }}>Contraseña</span>
          <div className="flex items-center gap-2 rounded-xl px-3.5 h-12 border" style={{ background: T.surface2, borderColor: T.line }}>
            <Lock size={17} color={T.inkMuted} />
            <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(e); }} placeholder="••••••••" className="flex-1 bg-transparent outline-none text-[15px]" style={{ color: T.ink }} />
            <button type="button" onClick={() => setShowPw((s) => !s)}>{showPw ? <EyeOff size={17} color={T.inkMuted} /> : <Eye size={17} color={T.inkMuted} />}</button>
          </div>
        </label>
        {error && <div className="flex items-center gap-2 text-[13px]" style={{ color: T.accent }}><AlertCircle size={15} /> {error}</div>}
        <div className="mt-2"><PrimaryButton onClick={submit} disabled={loading}>{loading ? "Un momento…" : isRegister ? "Crear cuenta" : "Entrar"}</PrimaryButton></div>
        {isRegister && <p className="text-center text-[12px]" style={{ color: T.inkMuted }}>La contraseña debe tener al menos 6 caracteres.</p>}
      </div>
    </div>
  );
}

function MedidasScreen({ measurements, setMeasurements, variables, db, userId }) {
  const [local, setLocal] = useState(measurements); const [saved, setSaved] = useState(false);
  const [viewingImage, setViewingImage] = useState(null); // variable cuya foto se está viendo
  useEffect(() => setLocal(measurements), [measurements]);
  const save = async () => {
    try {
      const rows = Object.entries(local)
        .filter(([, v]) => v !== undefined)
        .map(([variable_id, value]) => ({ user_id: userId, variable_id, value: value === "" ? null : Number(value) }));
      if (rows.length) await db.upsert("measurements", rows, "user_id,variable_id");
      setMeasurements(local); setSaved(true); setTimeout(() => setSaved(false), 1500);
    } catch { /* si falla, no se marca como guardado */ }
  };
  return (
    <div className="pb-24">
      <TopBar title="Mis medidas" right={<button onClick={save} className="text-[13.5px] font-semibold px-3 py-1.5 rounded-lg" style={{ color: "#FFF9F0", background: T.thread }}>{saved ? <Check size={16} /> : "Guardar"}</button>} />
      <p className="px-4 pt-4 text-[13px]" style={{ color: T.inkMuted }}>Todas las medidas se expresan en centímetros. Se usarán automáticamente en cualquier patrón que las necesite.</p>
      <div className="px-4 pt-4 flex flex-col gap-3">
        {variables.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-xl px-4 py-3 border" style={{ background: T.surface2, borderColor: T.line }}>
            <div className="flex items-center gap-2.5 min-w-0">
              {v.image && (
                <button onClick={() => setViewingImage(v)} className="shrink-0 w-9 h-9 rounded-lg overflow-hidden border" style={{ borderColor: T.line }}>
                  <img src={v.image} alt="" className="w-full h-full object-cover" />
                </button>
              )}
              <span className="text-[14px] truncate" style={{ color: T.ink }}>{v.label}</span>
              {v.image && (
                <button onClick={() => setViewingImage(v)} className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: T.paper, color: T.thread }}>¿Cómo?</button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input inputMode="decimal" value={local[v.id] ?? ""} onChange={(e) => setLocal((s) => ({ ...s, [v.id]: e.target.value.replace(",", ".") }))} placeholder="—"
                className="w-16 text-right bg-transparent outline-none font-semibold text-[15px] border-b" style={{ color: T.accent, borderColor: T.line, fontFamily: "'IBM Plex Mono',monospace" }} />
              <span className="text-[12px]" style={{ color: T.inkMuted }}>{v.unit || "cm"}</span>
            </div>
          </div>
        ))}
      </div>

      {viewingImage && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#000000E6" }} onClick={() => setViewingImage(null)}>
          <div className="flex items-center justify-between px-4 h-14 shrink-0">
            <span className="text-[15px] font-semibold" style={{ color: "#FFF9F0", fontFamily: "'Space Grotesk',sans-serif" }}>{viewingImage.label}</span>
            <button onClick={() => setViewingImage(null)} className="p-2"><X size={22} color="#FFF9F0" /></button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4 pb-6" onClick={(e) => e.stopPropagation()}>
            <img src={viewingImage.image} alt={viewingImage.label} className="max-w-full max-h-full rounded-xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} className="whitespace-nowrap px-3.5 py-1.5 rounded-full text-[13px] font-medium border"
      style={{ background: active ? T.ink : "transparent", color: active ? T.surface2 : T.inkMuted, borderColor: active ? T.ink : T.line }}>{label}</button>
  );
}
function PatternCard({ pattern, isFav, onToggleFav, onOpen }) {
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} className="w-full text-left rounded-2xl overflow-hidden border cursor-pointer" style={{ background: T.surface2, borderColor: T.line }}>
      <div className="h-28 flex items-center justify-center relative overflow-hidden" style={{ background: T.paper }}>
        {pattern.image ? <img src={pattern.image} alt="" className="w-full h-full object-cover" /> : <Scissors size={30} color={T.accent} strokeWidth={1.6} />}
        <button onClick={(e) => { e.stopPropagation(); onToggleFav(pattern.id); }} className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#FFFDF899" }}>
          <Heart size={16} color={T.accent} fill={isFav ? T.accent : "none"} />
        </button>
        {pattern.isPremium && <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: T.gold, color: "#FFF9F0" }}><Crown size={11} /> Premium</div>}
      </div>
      <div className="p-3.5">
        <h3 className="text-[15px] font-semibold mb-0.5" style={{ color: T.ink, fontFamily: "'Space Grotesk',sans-serif" }}>{pattern.name}</h3>
        <p className="text-[12.5px] mb-2 line-clamp-2" style={{ color: T.inkMuted }}>{pattern.description}</p>
        <div className="flex items-center gap-3 text-[11.5px]" style={{ color: T.inkMuted }}><span>{pattern.level}</span><span>·</span><span>{pattern.duration}</span></div>
      </div>
    </div>
  );
}
function CatalogScreen({ patterns, favorites, onToggleFav, onOpenPattern }) {
  const [cat, setCat] = useState("Todas");
  const filtered = cat === "Todas" ? patterns : patterns.filter((p) => p.category === cat);
  return (
    <div className="pb-24">
      <TopBar title="Catálogo de patrones" />
      <div className="flex gap-2 px-4 pt-4 pb-1 overflow-x-auto no-scrollbar">{["Todas", ...CATEGORIES].map((c) => <CategoryPill key={c} label={c} active={cat === c} onClick={() => setCat(c)} />)}</div>
      <div className="px-4 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {filtered.length === 0 && <p className="text-[13.5px] py-10 text-center col-span-full" style={{ color: T.inkMuted }}>Aún no hay patrones en esta categoría.</p>}
        {filtered.map((p) => <PatternCard key={p.id} pattern={p} isFav={favorites.includes(p.id)} onToggleFav={onToggleFav} onOpen={() => onOpenPattern(p.id)} />)}
      </div>
    </div>
  );
}
function PatternDetailScreen({ pattern, steps, progress, onBack, onStart, isFav, onToggleFav, hasAccess }) {
  const lastStep = progress?.[pattern.id];
  return (
    <div className="pb-8">
      <TopBar title={pattern.name} onBack={onBack} />
      <div className="h-40 flex items-center justify-center overflow-hidden" style={{ background: T.paper }}>{pattern.image ? <img src={pattern.image} alt="" className="w-full h-full object-cover" /> : <Scissors size={46} color={T.accent} strokeWidth={1.5} />}</div>
      <div className="px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[22px] font-bold" style={{ color: T.ink, fontFamily: "'Space Grotesk',sans-serif" }}>{pattern.name}</h2>
          <button onClick={() => onToggleFav(pattern.id)} className="w-10 h-10 rounded-full flex items-center justify-center border" style={{ borderColor: T.line }}><Heart size={18} color={T.accent} fill={isFav ? T.accent : "none"} /></button>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[13px]" style={{ color: T.inkMuted }}><span>{pattern.category}</span><span>·</span><span>{pattern.level}</span><span>·</span><span>{pattern.duration}</span></div>
        <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: T.ink }}>{pattern.description}</p>
        <div className="mt-5 rounded-xl border p-4" style={{ borderColor: T.line, background: T.surface2 }}>
          <p className="text-[13px] font-semibold mb-1" style={{ color: T.ink }}>Este patrón tiene {steps.length} pasos</p>
          <p className="text-[12.5px]" style={{ color: T.inkMuted }}>Usará tus medidas guardadas automáticamente en cada cota.</p>
        </div>
        {hasAccess ? (
          <div className="mt-6"><PrimaryButton onClick={() => onStart(pattern.id, lastStep ?? 0)}>{lastStep ? `Continuar desde el paso ${lastStep + 1}` : "Empezar patrón"}</PrimaryButton></div>
        ) : (
          <div className="mt-6 rounded-xl p-4 flex flex-col items-center text-center gap-2" style={{ background: T.paper, border: `1px solid ${T.gold}` }}>
            <Crown size={22} color={T.gold} />
            <p className="text-[14px] font-semibold" style={{ color: T.ink }}>Patrón exclusivo premium</p>
            <p className="text-[12.5px]" style={{ color: T.inkMuted }}>Este patrón solo está disponible para cuentas premium. Todavía no hay forma de hacerse premium desde la app — pronto.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StaticElement({ el }) {
  if (el.type === "rect") return <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="none" stroke={T.line} strokeWidth="0.6" strokeDasharray="1.5 1.5" />;
  if (el.type === "line") return <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.stroke || T.ink} strokeWidth={el.width || 0.8} strokeDasharray={el.dash} strokeLinecap="round" />;
  if (el.type === "polyline") return <polyline points={el.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={el.stroke || T.ink} strokeWidth={el.width || 0.8} strokeLinecap="round" strokeLinejoin="round" />;
  if (el.type === "bezier") return <path d={`M ${el.p0.x} ${el.p0.y} C ${el.c1.x} ${el.c1.y} ${el.c2.x} ${el.c2.y} ${el.p3.x} ${el.p3.y}`} fill="none" stroke={el.stroke || T.ink} strokeWidth={el.width || 0.9} strokeLinecap="round" />;
  if (el.type === "point") return (<g><circle cx={el.x} cy={el.y} r="1.4" fill={T.accent} /><text x={el.x + 2.4} y={el.y - 1.8} fontSize="4.6" fontWeight="600" fill={T.ink} fontFamily="Space Grotesk, sans-serif">{el.label}</text></g>);
  if (el.type === "text") return <text x={el.x} y={el.y} fontSize={el.size || 4.2} fill={T.inkMuted} fontFamily="Inter, sans-serif" transform={el.rotation ? `rotate(${el.rotation} ${el.x} ${el.y})` : undefined}>{el.text}</text>;
  return null;
}
function StaticCota({ cota, values }) {
  const display = tryFormula(cota.formula, values) || "—";
  const midX = (cota.x1 + cota.x2) / 2, midY = (cota.y1 + cota.y2) / 2;
  const isVert = cota.orientation === "vertical";
  return (
    <g>
      <line x1={cota.x1} y1={cota.y1} x2={cota.x2} y2={cota.y2} stroke={T.thread} strokeWidth="0.5" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <rect x={midX - 9} y={midY - 3.4} width="18" height="6.4" fill={T.surface2} opacity="0.92" transform={isVert ? `rotate(-90 ${midX} ${midY})` : undefined} />
      <text x={midX} y={midY} fontSize="4.2" fontWeight="600" fill={T.thread} fontFamily="IBM Plex Mono, monospace" textAnchor="middle" dy={isVert ? -1 : 1.5} transform={isVert ? `rotate(-90 ${midX} ${midY})` : undefined}>{display}</text>
    </g>
  );
}

function PatternSvg({ step, values }) {
  const [scale, setScale] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null); const pinch = useRef(null);
  const clampScale = (s) => Math.min(4, Math.max(0.6, s));
  const onWheel = (e) => { e.preventDefault(); setScale((s) => clampScale(s - e.deltaY * 0.0015)); };
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e) => { if (e.touches.length === 2) pinch.current = { d: dist(e.touches), scale }; else if (e.touches.length === 1) drag.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y }; };
  const onTouchMove = (e) => { if (e.touches.length === 2 && pinch.current) setScale(clampScale(pinch.current.scale * (dist(e.touches) / pinch.current.d))); else if (e.touches.length === 1 && drag.current) setPan({ x: e.touches[0].clientX - drag.current.x, y: e.touches[0].clientY - drag.current.y }); };
  const onTouchEnd = () => { drag.current = null; pinch.current = null; };
  const reset = () => { setScale(1); setPan({ x: 0, y: 0 }); };
  return (
    <div className="relative">
      <div className="overflow-hidden touch-none rounded-2xl border" style={{ background: T.surface2, borderColor: T.line, height: 340 }} onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="w-full h-full flex items-center justify-center" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})`, transition: drag.current ? "none" : "transform 0.05s linear" }}>
          <svg viewBox="0 0 120 160" width="240" height="320">
            {(step.elements || []).map((el) => <StaticElement key={el.id} el={el} />)}
            {(step.cotas || []).map((c) => <StaticCota key={c.id} cota={c} values={values} />)}
            <defs><marker id="arrow" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill={T.thread} /></marker></defs>
          </svg>
        </div>
      </div>
      <div className="absolute bottom-2 right-2 flex flex-col gap-1.5">
        <button onClick={() => setScale((s) => clampScale(s + 0.25))} className="w-9 h-9 rounded-full flex items-center justify-center shadow border" style={{ background: T.surface2, borderColor: T.line }}><Plus size={16} color={T.ink} /></button>
        <button onClick={() => setScale((s) => clampScale(s - 0.25))} className="w-9 h-9 rounded-full flex items-center justify-center shadow border" style={{ background: T.surface2, borderColor: T.line }}><Minus size={16} color={T.ink} /></button>
        <button onClick={reset} className="w-9 h-9 rounded-full flex items-center justify-center shadow border" style={{ background: T.surface2, borderColor: T.line }}><RotateCcw size={14} color={T.ink} /></button>
      </div>
    </div>
  );
}
function TapeProgress({ total, index, onJump }) {
  return (
    <div className="px-4 pt-3">
      <div className="flex items-end justify-between px-1">
        {Array.from({ length: total }).map((_, i) => {
          const done = i <= index;
          return (
            <button key={i} onClick={() => onJump(i)} className="flex flex-col items-center flex-1 group">
              <div style={{ height: i === index ? 16 : 10, width: 2, background: done ? T.accent : T.line, transition: "all .15s" }} />
              <div className="mt-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: i === index ? T.accent : done ? T.thread : T.surface2, color: i === index || done ? "#FFF9F0" : T.inkMuted, border: `1.5px solid ${i === index ? T.accent : done ? T.thread : T.line}` }}>{i + 1}</div>
            </button>
          );
        })}
      </div>
      <p className="text-center text-[12px] mt-2 font-medium" style={{ color: T.inkMuted, fontFamily: "'IBM Plex Mono',monospace" }}>PASO {index + 1} DE {total}</p>
    </div>
  );
}
function StepViewerScreen({ pattern, steps, initialIndex, values, variables, onBack, onProgress }) {
  const [index, setIndex] = useState(initialIndex); const step = steps[index];
  useEffect(() => { onProgress(pattern.id, index); }, [index]);
  const missing = variables.filter((v) => (step.cotas || []).some((c) => c.formula.includes(v.id)) && (values[v.id] === undefined || values[v.id] === ""));
  return (
    <div className="pb-8">
      <TopBar title={pattern.name} onBack={onBack} />
      <TapeProgress total={steps.length} index={index} onJump={setIndex} />
      <div className="px-4 pt-4"><PatternSvg step={step} values={values} /></div>
      <div className="px-5 pt-5">
        <h2 className="text-[19px] font-bold mb-1.5" style={{ color: T.ink, fontFamily: "'Space Grotesk',sans-serif" }}>{step.title}</h2>
        <p className="text-[14px] leading-relaxed mb-3" style={{ color: T.inkMuted }}>{step.explanation}</p>
        <div className="rounded-xl p-3.5 border mb-3" style={{ background: T.surface2, borderColor: T.line }}>
          <p className="text-[12px] font-semibold mb-1" style={{ color: T.thread }}>INSTRUCCIONES</p>
          <p className="text-[14px]" style={{ color: T.ink }}>{step.instructions}</p>
        </div>
        {missing.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl p-3 mb-3" style={{ background: "#F3E4DF" }}>
            <AlertCircle size={16} color={T.accent} className="mt-0.5 shrink-0" />
            <p className="text-[12.5px]" style={{ color: T.accentDark }}>Faltan medidas para calcular esta cota: {missing.map((m) => m.label).join(", ")}. Complétalas en «Mis medidas».</p>
          </div>
        )}
        <div className="flex flex-col gap-2 mb-4">
          {(step.cotas || []).map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl px-4 py-2.5 border" style={{ borderColor: T.line }}>
              <span className="text-[13.5px]" style={{ color: T.ink }}>{c.label}</span>
              <span className="text-[14.5px] font-semibold" style={{ color: T.thread, fontFamily: "'IBM Plex Mono',monospace" }}>{tryFormula(c.formula, values) || "—"}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 font-semibold text-[14.5px] border disabled:opacity-40" style={{ borderColor: T.line, color: T.ink }}><ChevronLeft size={17} /> Anterior</button>
          {index < steps.length - 1 ? (
            <button onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 font-semibold text-[14.5px]" style={{ background: T.accent, color: "#FFF9F0" }}>Siguiente <ChevronRight size={17} /></button>
          ) : (
            <button onClick={onBack} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 font-semibold text-[14.5px]" style={{ background: T.thread, color: "#FFF9F0" }}><Check size={17} /> Terminado</button>
          )}
        </div>
      </div>
    </div>
  );
}
function FavoritesScreen({ patterns, favorites, onToggleFav, onOpenPattern }) {
  const favPatterns = patterns.filter((p) => favorites.includes(p.id));
  return (
    <div className="pb-24">
      <TopBar title="Mis favoritos" />
      <div className="px-4 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {favPatterns.length === 0 && <p className="text-[13.5px] py-10 text-center col-span-full" style={{ color: T.inkMuted }}>Aún no has guardado ningún patrón como favorito.</p>}
        {favPatterns.map((p) => <PatternCard key={p.id} pattern={p} isFav onToggleFav={onToggleFav} onOpen={() => onOpenPattern(p.id)} />)}
      </div>
    </div>
  );
}
function ProfileScreen({ profile, setProfile, onLogout, onEnterAdmin, db }) {
  const [name, setName] = useState(profile.name); const [email] = useState(profile.email); const [saved, setSaved] = useState(false);
  const save = async () => {
    try { await db.patch(`profiles?id=eq.${profile.id}`, { name }); setProfile({ ...profile, name }); setSaved(true); setTimeout(() => setSaved(false), 1500); }
    catch { /* si falla, no se marca como guardado */ }
  };
  return (
    <div className="pb-24">
      <TopBar title="Mi perfil" />
      <div className="px-5 pt-6 flex flex-col items-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-[26px] font-bold mb-3" style={{ background: T.accent, color: "#FFF9F0", fontFamily: "'Space Grotesk',sans-serif" }}>{name?.[0]?.toUpperCase() || "?"}</div>
      </div>
      <div className="px-5 pt-2 flex flex-col gap-4">
        <TextField label="Nombre" icon={User} value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Email" icon={Mail} value={email} disabled />
        <PrimaryButton onClick={save} icon={saved ? Check : undefined}>{saved ? "Guardado" : "Guardar cambios"}</PrimaryButton>
        {profile.role === "admin" && (
          <button onClick={onEnterAdmin} className="flex items-center justify-center gap-2 py-3 font-semibold text-[14.5px] rounded-xl border" style={{ color: T.ink, borderColor: T.line }}><Settings size={17} /> Panel de administración</button>
        )}
        <button onClick={onLogout} className="flex items-center justify-center gap-2 py-3 font-semibold text-[14.5px]" style={{ color: T.accent }}><LogOut size={17} /> Cerrar sesión</button>
      </div>
    </div>
  );
}

/* ============================================================
   ==================  PANEL DE ADMINISTRACIÓN  =================
   ============================================================ */
function VariablesManager({ variables, onChange, onClose }) {
  const [label, setLabel] = useState(""); const [unit, setUnit] = useState("cm");
  const [busyId, setBusyId] = useState(null);
  const fileInputs = useRef({});
  const add = () => {
    if (!label.trim()) return;
    const id = label.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
    if (variables.some((v) => v.id === id)) return;
    onChange([...variables, { id, label: label.trim(), unit }]); setLabel("");
  };
  const remove = (id) => onChange(variables.filter((v) => v.id !== id));
  const pickImage = (id) => { const el = fileInputs.current[id]; if (el) el.click(); };
  const onImageChosen = async (id, file) => {
    if (!file) return;
    setBusyId(id);
    try {
      const dataUrl = await resizeImageFile(file);
      onChange(variables.map((v) => (v.id === id ? { ...v, image: dataUrl } : v)));
    } catch { /* si falla, simplemente no se guarda la foto */ }
    setBusyId(null);
  };
  const removeImage = (id) => onChange(variables.map((v) => (v.id === id ? { ...v, image: undefined } : v)));
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: T.paper }}>
      <TopBar title="Variables de medidas" onBack={onClose} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-[12.5px] mb-3" style={{ color: T.inkMuted }}>Añade una foto a cada medida explicando cómo se toma correctamente. Las clientas la verán al lado de esa medida.</p>
        <div className="rounded-xl border p-3 mb-4 flex gap-2" style={{ borderColor: T.line, background: T.surface2 }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nueva medida, p.ej. Largo de manga" className="flex-1 bg-transparent outline-none text-[14px]" style={{ color: T.ink }} />
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className="w-14 bg-transparent outline-none text-[13px] text-center border-l" style={{ color: T.inkMuted, borderColor: T.line }} />
          <button onClick={add} className="px-3 rounded-lg font-semibold text-[13px]" style={{ background: T.thread, color: "#FFF9F0" }}><Plus size={16} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {variables.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-xl px-4 py-3 border" style={{ borderColor: T.line, background: T.surface2 }}>
              <button onClick={() => pickImage(v.id)} className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border flex items-center justify-center" style={{ borderColor: T.line, background: T.paper }}>
                {busyId === v.id ? <RotateCcw size={16} color={T.inkMuted} className="animate-spin" /> : v.image ? <img src={v.image} alt="" className="w-full h-full object-cover" /> : <Plus size={18} color={T.inkMuted} />}
              </button>
              <input ref={(el) => (fileInputs.current[v.id] = el)} type="file" accept="image/*" className="hidden" onChange={(e) => onImageChosen(v.id, e.target.files?.[0])} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] truncate" style={{ color: T.ink }}>{v.label}</p>
                <p className="text-[11px]" style={{ color: T.inkMuted, fontFamily: "'IBM Plex Mono',monospace" }}>{v.id} · {v.unit}</p>
                <div className="flex items-center gap-3 mt-1">
                  <button onClick={() => pickImage(v.id)} className="text-[11.5px] font-semibold" style={{ color: T.thread }}>{v.image ? "Cambiar foto" : "Añadir foto"}</button>
                  {v.image && <button onClick={() => removeImage(v.id)} className="text-[11.5px] font-semibold" style={{ color: T.accent }}>Quitar foto</button>}
                </div>
              </div>
              <button onClick={() => remove(v.id)}><Trash2 size={16} color={T.accent} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ pattern, steps, variables, onClose }) {
  const [testValues, setTestValues] = useState(() => { const o = {}; variables.forEach((v) => (o[v.id] = "90")); return o; });
  const [index, setIndex] = useState(0);
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: T.paper }}>
      <TopBar title={`Vista previa · ${pattern.name}`} onBack={onClose} right={<Play size={18} color={T.thread} />} />
      <div className="px-4 pt-3 pb-2 overflow-x-auto no-scrollbar flex gap-2">
        {variables.map((v) => (
          <div key={v.id} className="flex flex-col items-center shrink-0 rounded-lg border px-2.5 py-1.5" style={{ borderColor: T.line, background: T.surface2 }}>
            <span className="text-[9.5px]" style={{ color: T.inkMuted }}>{v.label}</span>
            <input value={testValues[v.id] ?? ""} onChange={(e) => setTestValues((s) => ({ ...s, [v.id]: e.target.value.replace(",", ".") }))} className="w-14 text-center bg-transparent outline-none font-semibold text-[13px]" style={{ color: T.accent, fontFamily: "'IBM Plex Mono',monospace" }} />
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {steps.length === 0 ? (
          <p className="text-center py-16 text-[13.5px]" style={{ color: T.inkMuted }}>Este patrón todavía no tiene pasos.</p>
        ) : (
          <StepViewerScreen pattern={pattern} steps={steps} initialIndex={index} values={testValues} variables={variables} onBack={onClose} onProgress={() => {}} />
        )}
      </div>
    </div>
  );
}

const TOOLS = [
  { id: "select", label: "Seleccionar", icon: MousePointer2 },
  { id: "pan", label: "Mover lienzo", icon: Hand },
  { id: "point", label: "Punto", icon: CircleDot },
  { id: "line", label: "Línea", icon: Slash },
  { id: "polyline", label: "Polilínea", icon: PenTool },
  { id: "bezier", label: "Curva Bézier", icon: Move },
  { id: "text", label: "Texto", icon: TypeIcon },
  { id: "cota-h", label: "Cota horizontal", icon: Ruler },
  { id: "cota-v", label: "Cota vertical", icon: Ruler },
  { id: "cota-incl", label: "Cota inclinada", icon: Ruler },
  { id: "aux", label: "Línea auxiliar", icon: Slash },
];

function StepEditor({ pattern, step, variables, onSave, onBack, onOpenPreview }) {
  const [title, setTitle] = useState(step.title);
  const [explanation, setExplanation] = useState(step.explanation);
  const [instructions, setInstructions] = useState(step.instructions);
  const [elements, setElements] = useState(step.elements || []);
  const [cotas, setCotas] = useState(step.cotas || []);
  const [tool, setTool] = useState("select");
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [scale, setScale] = useState(2.4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(1);
  const [history, setHistory] = useState([{ elements: step.elements || [], cotas: step.cotas || [] }]);
  const [hIndex, setHIndex] = useState(0);
  const svgRef = useRef(null);
  const dragHandle = useRef(null);
  const panDrag = useRef(null);

  const pushHistory = (nextEls, nextCotas) => {
    const snap = { elements: nextEls, cotas: nextCotas };
    const trimmed = history.slice(0, hIndex + 1);
    setHistory([...trimmed, snap]);
    setHIndex(trimmed.length);
  };
  const applyState = (nextEls, nextCotas, record = true) => {
    setElements(nextEls); setCotas(nextCotas);
    if (record) pushHistory(nextEls, nextCotas);
  };
  const undo = () => { if (hIndex === 0) return; const i = hIndex - 1; setHIndex(i); setElements(history[i].elements); setCotas(history[i].cotas); };
  const redo = () => { if (hIndex >= history.length - 1) return; const i = hIndex + 1; setHIndex(i); setElements(history[i].elements); setCotas(history[i].cotas); };

  const toSvgPoint = (clientX, clientY) => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    const snap = (n) => Math.round(n / gridSize) * gridSize;
    return { x: snap(p.x), y: snap(p.y) };
  };

  const nextPointLabel = () => {
    const used = elements.filter((e) => e.type === "point").map((e) => e.label);
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const l of letters) if (!used.includes(l)) return l;
    return `P${used.length + 1}`;
  };

  const finishLine = (a, b, dash) => {
    const el = { id: uid(), type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: dash ? T.inkMuted : T.ink, width: dash ? 0.7 : 1, dash: dash ? "1.5 1.5" : undefined };
    const next = [...elements, el]; applyState(next, cotas); setSelected({ kind: "el", id: el.id });
  };
  const finishCota = (a, b, orientation) => {
    let x2 = b.x, y2 = b.y;
    if (orientation === "horizontal") y2 = a.y;
    if (orientation === "vertical") x2 = a.x;
    const cota = { id: uid(), label: "Nueva cota", formula: "", orientation, x1: a.x, y1: a.y, x2, y2 };
    const next = [...cotas, cota]; applyState(elements, next); setSelected({ kind: "cota", id: cota.id });
  };
  const finishPolyline = () => {
    if (pending.length < 2) { setPending([]); return; }
    const el = { id: uid(), type: "polyline", points: pending, stroke: T.ink, width: 1 };
    const next = [...elements, el]; applyState(next, cotas); setSelected({ kind: "el", id: el.id }); setPending([]);
  };
  const finishBezier = (pts) => {
    const el = { id: uid(), type: "bezier", p0: pts[0], c1: pts[1], c2: pts[2], p3: pts[3], stroke: T.ink, width: 1.1 };
    const next = [...elements, el]; applyState(next, cotas); setSelected({ kind: "el", id: el.id }); setPending([]);
  };

  const onCanvasClick = (e) => {
    if (dragHandle.current || panDrag.current) return;
    const p = toSvgPoint(e.clientX, e.clientY);
    if (tool === "point") {
      const el = { id: uid(), type: "point", x: p.x, y: p.y, label: nextPointLabel(), desc: "" };
      const next = [...elements, el]; applyState(next, cotas); setSelected({ kind: "el", id: el.id }); return;
    }
    if (tool === "text") {
      const el = { id: uid(), type: "text", x: p.x, y: p.y, text: "Texto", size: 4.5, rotation: 0 };
      const next = [...elements, el]; applyState(next, cotas); setSelected({ kind: "el", id: el.id }); return;
    }
    if (tool === "line" || tool === "aux") {
      if (pending.length === 0) setPending([p]);
      else { finishLine(pending[0], p, tool === "aux"); setPending([]); }
      return;
    }
    if (tool === "polyline") { setPending((prev) => [...prev, p]); return; }
    if (tool === "bezier") {
      const next = [...pending, p];
      if (next.length === 4) finishBezier(next); else setPending(next);
      return;
    }
    if (tool === "cota-h" || tool === "cota-v" || tool === "cota-incl") {
      const orientation = tool === "cota-h" ? "horizontal" : tool === "cota-v" ? "vertical" : "inclined";
      if (pending.length === 0) setPending([p]);
      else { finishCota(pending[0], p, orientation); setPending([]); }
      return;
    }
    if (tool === "select") setSelected(null);
  };

  const onCanvasPointerMove = (e) => {
    const p = toSvgPoint(e.clientX, e.clientY);
    setCursor(p);
    if (dragHandle.current) {
      const { kind, id, key } = dragHandle.current;
      if (kind === "el") {
        setElements((prev) => prev.map((el) => {
          if (el.id !== id) return el;
          if (el.type === "line") return key === "1" ? { ...el, x1: p.x, y1: p.y } : { ...el, x2: p.x, y2: p.y };
          if (el.type === "point") return { ...el, x: p.x, y: p.y };
          if (el.type === "text") return { ...el, x: p.x, y: p.y };
          if (el.type === "polyline") { const pts = el.points.slice(); pts[+key] = p; return { ...el, points: pts }; }
          if (el.type === "bezier") return { ...el, [key]: p };
          return el;
        }));
      } else if (kind === "cota") {
        setCotas((prev) => prev.map((c) => c.id !== id ? c : key === "1" ? { ...c, x1: p.x, y1: p.y } : { ...c, x2: p.x, y2: p.y }));
      } else if (kind === "moveEl") {
        const dx = p.x - dragHandle.current.originX, dy = p.y - dragHandle.current.originY;
        const s = dragHandle.current.snapshot;
        setElements((prev) => prev.map((el) => {
          if (el.id !== id) return el;
          if (el.type === "line") return { ...el, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
          if (el.type === "point") return { ...el, x: s.x + dx, y: s.y + dy };
          if (el.type === "text") return { ...el, x: s.x + dx, y: s.y + dy };
          if (el.type === "polyline") return { ...el, points: s.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) };
          if (el.type === "bezier") return { ...el, p0: { x: s.p0.x + dx, y: s.p0.y + dy }, c1: { x: s.c1.x + dx, y: s.c1.y + dy }, c2: { x: s.c2.x + dx, y: s.c2.y + dy }, p3: { x: s.p3.x + dx, y: s.p3.y + dy } };
          return el;
        }));
      } else if (kind === "moveCota") {
        const dx = p.x - dragHandle.current.originX, dy = p.y - dragHandle.current.originY;
        const s = dragHandle.current.snapshot;
        setCotas((prev) => prev.map((c) => (c.id !== id ? c : { ...c, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy })));
      }
      return;
    }
    if (panDrag.current) {
      setPan({ x: e.clientX - panDrag.current.startX + panDrag.current.panX, y: e.clientY - panDrag.current.startY + panDrag.current.panY });
    }
  };
  const onCanvasPointerUp = () => {
    if (dragHandle.current) { dragHandle.current = null; pushHistory(elements, cotas); }
    panDrag.current = null;
  };
  const startPan = (e) => { if (tool !== "pan") return; panDrag.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }; };

  const startHandleDrag = (kind, id, key) => (e) => { e.stopPropagation(); dragHandle.current = { kind, id, key }; };

  // Arrastrar el TRAZO COMPLETO (no solo un extremo) para moverlo sin borrarlo
  const startBodyDrag = (kind, id) => (e) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSelected({ kind, id });
    const p = toSvgPoint(e.clientX, e.clientY);
    const source = kind === "el" ? elements.find((x) => x.id === id) : cotas.find((x) => x.id === id);
    if (!source) return;
    dragHandle.current = { kind: kind === "el" ? "moveEl" : "moveCota", id, originX: p.x, originY: p.y, snapshot: JSON.parse(JSON.stringify(source)) };
  };

  // Duplicar el elemento o la cota seleccionada (aparece un poco desplazada, lista para mover)
  const duplicateSelected = () => {
    if (!selected) return;
    const OFFSET = 6;
    if (selected.kind === "el") {
      const el = elements.find((e) => e.id === selected.id); if (!el) return;
      let copy;
      if (el.type === "line") copy = { ...el, id: uid(), x1: el.x1 + OFFSET, y1: el.y1 + OFFSET, x2: el.x2 + OFFSET, y2: el.y2 + OFFSET };
      else if (el.type === "point") copy = { ...el, id: uid(), x: el.x + OFFSET, y: el.y + OFFSET, label: nextPointLabel() };
      else if (el.type === "text") copy = { ...el, id: uid(), x: el.x + OFFSET, y: el.y + OFFSET };
      else if (el.type === "polyline") copy = { ...el, id: uid(), points: el.points.map((pt) => ({ x: pt.x + OFFSET, y: pt.y + OFFSET })) };
      else if (el.type === "bezier") copy = { ...el, id: uid(), p0: { x: el.p0.x + OFFSET, y: el.p0.y + OFFSET }, c1: { x: el.c1.x + OFFSET, y: el.c1.y + OFFSET }, c2: { x: el.c2.x + OFFSET, y: el.c2.y + OFFSET }, p3: { x: el.p3.x + OFFSET, y: el.p3.y + OFFSET } };
      else return;
      const next = [...elements, copy]; applyState(next, cotas); setSelected({ kind: "el", id: copy.id });
    } else {
      const c = cotas.find((x) => x.id === selected.id); if (!c) return;
      const copy = { ...c, id: uid(), x1: c.x1 + OFFSET, y1: c.y1 + OFFSET, x2: c.x2 + OFFSET, y2: c.y2 + OFFSET };
      const next = [...cotas, copy]; applyState(elements, next); setSelected({ kind: "cota", id: copy.id });
    }
  };

  const deleteSelected = () => {
    if (!selected) return;
    if (selected.kind === "el") { const next = elements.filter((e) => e.id !== selected.id); applyState(next, cotas); }
    else { const next = cotas.filter((c) => c.id !== selected.id); applyState(elements, next); }
    setSelected(null);
  };

  const updateSelectedEl = (patch) => { const next = elements.map((e) => e.id === selected.id ? { ...e, ...patch } : e); setElements(next); pushHistory(next, cotas); };
  const updateSelectedCota = (patch) => { const next = cotas.map((c) => c.id === selected.id ? { ...c, ...patch } : c); setCotas(next); pushHistory(elements, next); };

  const save = () => onSave({ ...step, title, explanation, instructions, elements, cotas });

  const selEl = selected?.kind === "el" ? elements.find((e) => e.id === selected.id) : null;
  const selCota = selected?.kind === "cota" ? cotas.find((c) => c.id === selected.id) : null;

  const gridLines = [];
  if (showGrid) {
    for (let x = 0; x <= 120; x += gridSize) gridLines.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={160} stroke={x % 10 === 0 ? T.line : "#EADFC7"} strokeWidth={x % 10 === 0 ? 0.25 : 0.12} />);
    for (let y = 0; y <= 160; y += gridSize) gridLines.push(<line key={`gy${y}`} x1={0} y1={y} x2={120} y2={y} stroke={y % 10 === 0 ? T.line : "#EADFC7"} strokeWidth={y % 10 === 0 ? 0.25 : 0.12} />);
  }

  const helpText = {
    point: "Toca el lienzo para colocar un punto.",
    text: "Toca el lienzo para colocar un texto.",
    line: pending.length === 0 ? "Toca el punto inicial de la línea." : "Toca el punto final de la línea.",
    aux: pending.length === 0 ? "Toca el inicio de la línea auxiliar." : "Toca el final de la línea auxiliar.",
    polyline: "Toca puntos para la polilínea. Pulsa «Finalizar» al terminar.",
    bezier: ["Toca el punto inicial.", "Toca el primer punto de control.", "Toca el segundo punto de control.", "Toca el punto final."][pending.length] || "",
    "cota-h": pending.length === 0 ? "Toca el inicio de la cota horizontal." : "Toca el final de la cota.",
    "cota-v": pending.length === 0 ? "Toca el inicio de la cota vertical." : "Toca el final de la cota.",
    "cota-incl": pending.length === 0 ? "Toca el inicio de la cota inclinada." : "Toca el final de la cota.",
    select: selected ? "Arrastra el trazo para moverlo entero, o los puntos dorados para ajustar sus extremos." : "Toca un elemento para seleccionarlo. Arriba, junto a la papelera, puedes copiarlo.",
    pan: "Arrastra el lienzo para desplazarte.",
  }[tool];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: T.ink }}>
      <div className="flex items-center justify-between px-3 h-14 border-b" style={{ borderColor: "#000" }}>
        <button onClick={onBack} className="p-1.5"><ChevronLeft size={22} color={T.surface2} /></button>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 mx-2 bg-transparent outline-none text-[15px] font-semibold" style={{ color: T.surface2, fontFamily: "'Space Grotesk',sans-serif" }} />
        <button onClick={save} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold" style={{ background: T.thread, color: "#FFF9F0" }}><Save size={14} /> Guardar</button>
      </div>

      <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto no-scrollbar border-b" style={{ borderColor: "#000", background: "#211D18" }}>
        {TOOLS.map((t) => {
          const Icon = t.icon; const active = tool === t.id;
          return (
            <button key={t.id} onClick={() => { setTool(t.id); setPending([]); setSelected(null); dragHandle.current = null; panDrag.current = null; }} title={t.label}
              className="shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg" style={{ background: active ? T.accent : "transparent" }}>
              <Icon size={16} color={active ? "#FFF9F0" : "#B8AFA0"} />
            </button>
          );
        })}
        <div className="w-px h-6 mx-1" style={{ background: "#3A342C" }} />
        <button onClick={undo} disabled={hIndex === 0} className="shrink-0 p-2 rounded-lg disabled:opacity-30"><Undo2 size={16} color="#B8AFA0" /></button>
        <button onClick={redo} disabled={hIndex >= history.length - 1} className="shrink-0 p-2 rounded-lg disabled:opacity-30"><Redo2 size={16} color="#B8AFA0" /></button>
        <button onClick={duplicateSelected} disabled={!selected} title="Copiar" className="shrink-0 p-2 rounded-lg disabled:opacity-30"><Copy size={16} color="#B8AFA0" /></button>
        <button onClick={deleteSelected} disabled={!selected} className="shrink-0 p-2 rounded-lg disabled:opacity-30"><Trash2 size={16} color="#E08A80" /></button>
        <button onClick={() => setShowGrid((s) => !s)} className="shrink-0 p-2 rounded-lg"><Grid3x3 size={16} color={showGrid ? T.gold : "#B8AFA0"} /></button>
      </div>

      {helpText && <p className="text-[11.5px] px-3 py-1.5" style={{ color: "#D8C9A3", background: "#2A251E" }}>{helpText}{pending.length > 0 && (tool === "polyline") && <button onClick={finishPolyline} className="ml-2 underline font-semibold">Finalizar</button>}</p>}

      <div className="flex-1 overflow-hidden relative" style={{ background: "#3A342C" }}>
        <svg
          ref={svgRef} viewBox="0 0 120 160" className="w-full h-full touch-none"
          style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})`, transformOrigin: "center" }}
          onClick={onCanvasClick}
          onPointerDown={startPan}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
        >
          <rect x="0" y="0" width="120" height="160" fill={T.surface2} />
          {gridLines}
          {elements.map((el) => (
            <g key={el.id} onClick={(e) => { if (tool === "select") { e.stopPropagation(); setSelected({ kind: "el", id: el.id }); } }}>
              {tool === "select" && el.type === "line" && <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke="transparent" strokeWidth="6" onPointerDown={startBodyDrag("el", el.id)} />}
              {tool === "select" && el.type === "polyline" && <polyline points={el.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="transparent" strokeWidth="6" onPointerDown={startBodyDrag("el", el.id)} />}
              {tool === "select" && el.type === "bezier" && <path d={`M ${el.p0.x} ${el.p0.y} C ${el.c1.x} ${el.c1.y} ${el.c2.x} ${el.c2.y} ${el.p3.x} ${el.p3.y}`} fill="none" stroke="transparent" strokeWidth="6" onPointerDown={startBodyDrag("el", el.id)} />}
              {tool === "select" && el.type === "point" && <circle cx={el.x} cy={el.y} r="4.5" fill="transparent" onPointerDown={startBodyDrag("el", el.id)} />}
              {tool === "select" && el.type === "text" && <circle cx={el.x} cy={el.y} r="4.5" fill="transparent" onPointerDown={startBodyDrag("el", el.id)} />}
              <StaticElement el={el} />
              {selected?.kind === "el" && selected.id === el.id && el.type === "line" && (
                <rect x={Math.min(el.x1, el.x2) - 1} y={Math.min(el.y1, el.y2) - 1} width={Math.abs(el.x2 - el.x1) + 2} height={Math.abs(el.y2 - el.y1) + 2} fill="none" stroke={T.gold} strokeWidth="0.4" strokeDasharray="1 1" />
              )}
            </g>
          ))}
          {cotas.map((c) => (
            <g key={c.id} onClick={(e) => { if (tool === "select") { e.stopPropagation(); setSelected({ kind: "cota", id: c.id }); } }}>
              {tool === "select" && <line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke="transparent" strokeWidth="6" onPointerDown={startBodyDrag("cota", c.id)} />}
              <StaticCota cota={c} values={{}} />
            </g>
          ))}

          {pending.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1" fill={T.gold} />)}
          {pending.length > 0 && cursor && (tool === "line" || tool === "aux" || tool.startsWith("cota")) && (
            <line x1={pending[0].x} y1={pending[0].y} x2={cursor.x} y2={cursor.y} stroke={T.gold} strokeWidth="0.5" strokeDasharray="1 1" />
          )}
          {pending.length > 1 && tool === "polyline" && <polyline points={pending.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={T.gold} strokeWidth="0.6" />}

          {tool === "select" && selEl && selEl.type === "line" && (<>
            <circle cx={selEl.x1} cy={selEl.y1} r="1.6" fill={T.gold} onPointerDown={startHandleDrag("el", selEl.id, "1")} />
            <circle cx={selEl.x2} cy={selEl.y2} r="1.6" fill={T.gold} onPointerDown={startHandleDrag("el", selEl.id, "2")} />
          </>)}
          {tool === "select" && selEl && selEl.type === "point" && <circle cx={selEl.x} cy={selEl.y} r="2" fill="none" stroke={T.gold} strokeWidth="0.5" onPointerDown={startHandleDrag("el", selEl.id, "0")} />}
          {tool === "select" && selEl && selEl.type === "text" && <circle cx={selEl.x} cy={selEl.y} r="1.6" fill={T.gold} onPointerDown={startHandleDrag("el", selEl.id, "0")} />}
          {tool === "select" && selEl && selEl.type === "polyline" && selEl.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1.6" fill={T.gold} onPointerDown={startHandleDrag("el", selEl.id, String(i))} />)}
          {tool === "select" && selEl && selEl.type === "bezier" && ["p0", "c1", "c2", "p3"].map((k) => <circle key={k} cx={selEl[k].x} cy={selEl[k].y} r="1.6" fill={k.startsWith("c") ? T.thread : T.gold} onPointerDown={startHandleDrag("el", selEl.id, k)} />)}
          {tool === "select" && selCota && (<>
            <circle cx={selCota.x1} cy={selCota.y1} r="1.6" fill={T.gold} onPointerDown={startHandleDrag("cota", selCota.id, "1")} />
            <circle cx={selCota.x2} cy={selCota.y2} r="1.6" fill={T.gold} onPointerDown={startHandleDrag("cota", selCota.id, "2")} />
          </>)}
        </svg>
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <button onClick={() => setScale((s) => Math.min(6, s + 0.4))} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: T.surface2 }}><ZoomIn size={15} color={T.ink} /></button>
          <button onClick={() => setScale((s) => Math.max(0.8, s - 0.4))} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: T.surface2 }}><ZoomOut size={15} color={T.ink} /></button>
        </div>
      </div>

      <div className="border-t px-4 py-3 overflow-y-auto" style={{ borderColor: "#000", background: "#211D18", maxHeight: "34vh" }}>
        {selEl && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: T.gold }}>{selEl.type === "point" ? "Punto" : selEl.type === "text" ? "Texto" : selEl.type === "bezier" ? "Curva Bézier" : selEl.type === "polyline" ? "Polilínea" : "Línea"}</p>
            {selEl.type === "point" && (<>
              <input value={selEl.label} onChange={(e) => updateSelectedEl({ label: e.target.value })} placeholder="Nombre (A, B, C…)" className="rounded-lg px-3 h-9 text-[13px] outline-none" style={{ background: "#3A342C", color: "#FFF9F0" }} />
              <input value={selEl.desc || ""} onChange={(e) => updateSelectedEl({ desc: e.target.value })} placeholder="Descripción" className="rounded-lg px-3 h-9 text-[13px] outline-none" style={{ background: "#3A342C", color: "#FFF9F0" }} />
            </>)}
            {selEl.type === "text" && (<>
              <input value={selEl.text} onChange={(e) => updateSelectedEl({ text: e.target.value })} className="rounded-lg px-3 h-9 text-[13px] outline-none" style={{ background: "#3A342C", color: "#FFF9F0" }} />
              <div className="flex items-center gap-2">
                <span className="text-[11px]" style={{ color: "#B8AFA0" }}>Tamaño</span>
                <input type="range" min="2" max="9" step="0.5" value={selEl.size} onChange={(e) => updateSelectedEl({ size: +e.target.value })} className="flex-1" />
                <span className="text-[11px]" style={{ color: "#B8AFA0" }}>Rotación</span>
                <input type="range" min="0" max="360" value={selEl.rotation || 0} onChange={(e) => updateSelectedEl({ rotation: +e.target.value })} className="flex-1" />
              </div>
            </>)}
            {(selEl.type === "line" || selEl.type === "polyline" || selEl.type === "bezier") && (
              <p className="text-[12px]" style={{ color: "#B8AFA0" }}>Arrastra los puntos dorados sobre el lienzo para ajustar el trazo.</p>
            )}
          </div>
        )}
        {selCota && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: T.gold }}>Cota ({selCota.orientation})</p>
            <input value={selCota.label} onChange={(e) => updateSelectedCota({ label: e.target.value })} placeholder="Etiqueta de la cota" className="rounded-lg px-3 h-9 text-[13px] outline-none" style={{ background: "#3A342C", color: "#FFF9F0" }} />
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {variables.map((v) => (
                <button key={v.id} onClick={() => updateSelectedCota({ formula: (selCota.formula ? selCota.formula + " " : "") + v.id })} className="shrink-0 px-2.5 py-1 rounded-full text-[11px]" style={{ background: "#3A342C", color: T.gold }}>{v.id}</button>
              ))}
            </div>
            <input value={selCota.formula} onChange={(e) => updateSelectedCota({ formula: e.target.value })} placeholder="Fórmula, p.ej. cintura / 4" className="rounded-lg px-3 h-9 text-[13px] outline-none" style={{ background: "#3A342C", color: "#FFF9F0", fontFamily: "'IBM Plex Mono',monospace" }} />
            <p className="text-[12px]" style={{ color: tryFormula(selCota.formula, Object.fromEntries(variables.map((v) => [v.id, 90]))) ? T.thread : "#E08A80" }}>
              {tryFormula(selCota.formula, Object.fromEntries(variables.map((v) => [v.id, 90]))) ? `Con valores de prueba (90 cm): ${tryFormula(selCota.formula, Object.fromEntries(variables.map((v) => [v.id, 90])))}` : "Escribe una fórmula válida usando las variables de arriba."}
            </p>
          </div>
        )}
        {!selEl && !selCota && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: T.gold }}>Paso</p>
            <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explicación" rows={2} className="rounded-lg px-3 py-2 text-[13px] outline-none resize-none" style={{ background: "#3A342C", color: "#FFF9F0" }} />
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Instrucciones" rows={2} className="rounded-lg px-3 py-2 text-[13px] outline-none resize-none" style={{ background: "#3A342C", color: "#FFF9F0" }} />
          </div>
        )}
      </div>
    </div>
  );
}

function PatternEditor({ pattern, steps, variables, onBack, onSavePattern, onStepsChange, onDeletePattern, onUpdateVariables }) {
  const [p, setP] = useState(pattern);
  const [editingStep, setEditingStep] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [showVars, setShowVars] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const imgInput = useRef(null);
  const onPickImage = async (file) => {
    if (!file) return;
    setImgBusy(true);
    try { const dataUrl = await resizeImageFile(file, 900, 0.75); setP((prev) => ({ ...prev, image: dataUrl })); }
    catch { /* si falla, no se guarda la foto */ }
    setImgBusy(false);
  };

  const save = () => onSavePattern(p);

  const addStep = () => {
    const step = { id: uid(), order: steps.length + 1, title: "Nuevo paso", explanation: "", instructions: "", elements: [], cotas: [] };
    onStepsChange([...steps, step]);
  };
  const removeStep = (id) => onStepsChange(steps.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i + 1 })));
  const duplicateStep = (id) => {
    const s = steps.find((x) => x.id === id);
    const copy = { ...s, id: uid(), title: s.title + " (copia)" };
    const idx = steps.findIndex((x) => x.id === id);
    const next = [...steps.slice(0, idx + 1), copy, ...steps.slice(idx + 1)].map((s, i) => ({ ...s, order: i + 1 }));
    onStepsChange(next);
  };
  const moveStep = (id, dir) => {
    const idx = steps.findIndex((s) => s.id === id);
    const j = idx + dir; if (j < 0 || j >= steps.length) return;
    const next = steps.slice(); [next[idx], next[j]] = [next[j], next[idx]];
    onStepsChange(next.map((s, i) => ({ ...s, order: i + 1 })));
  };
  const saveStepEdit = (updated) => { onStepsChange(steps.map((s) => (s.id === updated.id ? updated : s))); setEditingStep(null); };

  if (editingStep) {
    return <StepEditor pattern={p} step={editingStep} variables={variables} onSave={saveStepEdit} onBack={() => setEditingStep(null)} />;
  }
  if (previewing) {
    return <PreviewModal pattern={p} steps={steps} variables={variables} onClose={() => setPreviewing(false)} />;
  }
  if (showVars) {
    return <VariablesManager variables={variables} onChange={onUpdateVariables} onClose={() => setShowVars(false)} />;
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: T.paper }}>
      <TopBar title="Editar patrón" onBack={onBack} right={
        <div className="flex items-center gap-1.5">
          <button onClick={() => setPreviewing(true)} className="p-2 rounded-lg" style={{ background: T.surface }}><Play size={16} color={T.thread} /></button>
          <button onClick={save} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold" style={{ background: T.thread, color: "#FFF9F0" }}><Save size={14} /> Guardar</button>
        </div>
      } />
      <div className="px-5 pt-4 flex flex-col gap-3">
        <label className="block">
          <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: T.inkMuted }}>Foto del patrón</span>
          <button onClick={() => imgInput.current?.click()} className="w-full h-32 rounded-xl border overflow-hidden flex items-center justify-center" style={{ borderColor: T.line, background: T.surface2 }}>
            {imgBusy ? <RotateCcw size={20} color={T.inkMuted} className="animate-spin" /> : p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <span className="text-[13px] flex items-center gap-1.5" style={{ color: T.inkMuted }}><Plus size={16} /> Añadir foto</span>}
          </button>
          <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
          {p.image && <button onClick={() => setP((prev) => ({ ...prev, image: undefined }))} className="text-[12px] font-semibold mt-1.5" style={{ color: T.accent }}>Quitar foto</button>}
        </label>
        <TextField label="Nombre del patrón" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        <label className="block">
          <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: T.inkMuted }}>Categoría</span>
          <select value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} className="w-full rounded-xl px-3.5 h-12 border outline-none text-[15px]" style={{ background: T.surface2, borderColor: T.line, color: T.ink }}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: T.inkMuted }}>Nivel</span>
            <select value={p.level} onChange={(e) => setP({ ...p, level: e.target.value })} className="w-full rounded-xl px-3.5 h-12 border outline-none text-[15px]" style={{ background: T.surface2, borderColor: T.line, color: T.ink }}>
              {["Principiante", "Intermedio", "Avanzado"].map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <TextField label="Duración" value={p.duration} onChange={(e) => setP({ ...p, duration: e.target.value })} />
        </div>
        <label className="block">
          <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: T.inkMuted }}>Descripción</span>
          <textarea value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} rows={3} className="w-full rounded-xl px-3.5 py-3 border outline-none text-[14px] resize-none" style={{ background: T.surface2, borderColor: T.line, color: T.ink }} />
        </label>
        <div className="flex items-center justify-between rounded-xl px-4 py-3 border" style={{ borderColor: T.line, background: T.surface2 }}>
          <span className="text-[14px] flex items-center gap-1.5" style={{ color: T.ink }}><Crown size={15} color={T.gold} /> Patrón premium</span>
          <input type="checkbox" checked={p.isPremium} onChange={(e) => setP({ ...p, isPremium: e.target.checked })} className="w-5 h-5" />
        </div>
        <div className="flex items-center justify-between rounded-xl px-4 py-3 border" style={{ borderColor: T.line, background: T.surface2 }}>
          <span className="text-[14px]" style={{ color: T.ink }}>Publicado (visible para clientes)</span>
          <input type="checkbox" checked={p.published} onChange={(e) => setP({ ...p, published: e.target.checked })} className="w-5 h-5" />
        </div>

        <button onClick={() => setShowVars(true)} className="flex items-center justify-center gap-2 py-3 rounded-xl border font-semibold text-[13.5px]" style={{ borderColor: T.line, color: T.ink }}><Layers size={16} /> Gestionar variables de medidas</button>

        <div className="mt-4 flex items-center justify-between">
          <h3 className="text-[15px] font-bold" style={{ color: T.ink, fontFamily: "'Space Grotesk',sans-serif" }}>Pasos ({steps.length})</h3>
          <button onClick={addStep} className="flex items-center gap-1 text-[13px] font-semibold px-3 py-1.5 rounded-lg" style={{ background: T.accent, color: "#FFF9F0" }}><Plus size={14} /> Añadir paso</button>
        </div>

        <div className="flex flex-col gap-2 mt-1">
          {steps.length === 0 && <p className="text-[13px] py-6 text-center" style={{ color: T.inkMuted }}>Este patrón todavía no tiene pasos.</p>}
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: T.line, background: T.surface2 }}>
              <div className="flex flex-col">
                <button onClick={() => moveStep(s.id, -1)} disabled={i === 0} className="disabled:opacity-30"><ChevronUp size={14} color={T.inkMuted} /></button>
                <button onClick={() => moveStep(s.id, 1)} disabled={i === steps.length - 1} className="disabled:opacity-30"><ChevronDown size={14} color={T.inkMuted} /></button>
              </div>
              <button onClick={() => setEditingStep(s)} className="flex-1 text-left">
                <p className="text-[14px] font-medium" style={{ color: T.ink }}>{i + 1}. {s.title}</p>
                <p className="text-[11.5px]" style={{ color: T.inkMuted }}>{(s.elements || []).length} elementos · {(s.cotas || []).length} cotas</p>
              </button>
              <button onClick={() => duplicateStep(s.id)}><Copy size={15} color={T.inkMuted} /></button>
              <button onClick={() => removeStep(s.id)}><Trash2 size={15} color={T.accent} /></button>
            </div>
          ))}
        </div>

        <button onClick={() => onDeletePattern(p.id)} className="mt-8 flex items-center justify-center gap-2 py-3 font-semibold text-[13.5px]" style={{ color: T.accent }}><Trash2 size={15} /> Eliminar este patrón</button>
      </div>
    </div>
  );
}

function AdminDashboard({ patterns, variables, onOpenPattern, onCreatePattern, onDeletePattern, onExit, onShowVars }) {
  return (
    <div className="min-h-screen pb-10" style={{ background: T.paper }}>
      <TopBar title="Panel de administración" onBack={onExit} right={<ShieldCheck size={18} color={T.gold} />} />
      <div className="px-5 pt-4 flex items-center justify-between">
        <h2 className="text-[16px] font-bold" style={{ color: T.ink, fontFamily: "'Space Grotesk',sans-serif" }}>Patrones ({patterns.length})</h2>
        <div className="flex gap-2">
          <button onClick={onShowVars} title="Gestionar variables" className="p-2 rounded-lg border" style={{ borderColor: T.line }}><Layers size={16} color={T.ink} /></button>
          <button onClick={onCreatePattern} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold" style={{ background: T.accent, color: "#FFF9F0" }}><FolderPlus size={15} /> Nuevo patrón</button>
        </div>
      </div>
      <div className="px-5 pt-3 flex flex-col gap-2.5">
        {patterns.map((p) => (
          <button key={p.id} onClick={() => onOpenPattern(p.id)} className="w-full text-left flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: T.line, background: T.surface2 }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: T.paper }}><Scissors size={18} color={T.accent} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[14.5px] font-semibold truncate" style={{ color: T.ink }}>{p.name}</p>
              <p className="text-[11.5px]" style={{ color: T.inkMuted }}>{p.category} · {p.published ? "Publicado" : "Borrador"}{p.isPremium ? " · Premium" : ""}</p>
            </div>
            <ChevronRight size={17} color={T.inkMuted} />
          </button>
        ))}
      </div>
    </div>
  );
}

function AdminRoot({ patterns, stepsByPattern, variables, onExit, updatePatterns, updateSteps, updateVariables }) {
  const [openId, setOpenId] = useState(null);
  const [showVars, setShowVars] = useState(false);

  const createPattern = () => {
    const id = "patron-" + uid();
    const p = { id, name: "Nuevo patrón", category: CATEGORIES[0], level: "Principiante", duration: "30 min", isPremium: false, published: false, description: "" };
    updatePatterns([...patterns, p]);
    updateSteps(id, []);
    setOpenId(id);
  };
  const deletePattern = (id) => { updatePatterns(patterns.filter((p) => p.id !== id)); setOpenId(null); };
  const savePattern = (updated) => updatePatterns(patterns.map((p) => (p.id === updated.id ? updated : p)));

  if (showVars) return <VariablesManager variables={variables} onChange={updateVariables} onClose={() => setShowVars(false)} />;

  if (openId) {
    const pattern = patterns.find((p) => p.id === openId);
    if (!pattern) { setOpenId(null); return null; }
    return (
      <PatternEditor
        pattern={pattern}
        steps={stepsByPattern[openId] || []}
        variables={variables}
        onBack={() => setOpenId(null)}
        onSavePattern={savePattern}
        onStepsChange={(steps) => updateSteps(openId, steps)}
        onDeletePattern={deletePattern}
        onUpdateVariables={updateVariables}
      />
    );
  }
  return <AdminDashboard patterns={patterns} variables={variables} onOpenPattern={setOpenId} onCreatePattern={createPattern} onDeletePattern={deletePattern} onExit={onExit} onShowVars={() => setShowVars(true)} />;
}

/* ============================================================
   APP RAÍZ
   ============================================================ */
async function getUser(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) { const e = new Error("unauthorized"); e.status = res.status; throw e; }
  return res.json();
}
function mapPatternRow(row) {
  return { id: row.id, name: row.name, category: row.categories?.name || "", level: row.level, duration: row.duration,
    isPremium: !!row.is_premium, published: !!row.published, description: row.description || "", image: row.image || undefined };
}
function mapStepsFromRow(row) {
  const steps = (row.steps || []).slice().sort((a, b) => a.step_order - b.step_order);
  return steps.map((s) => ({
    id: s.id, order: s.step_order, title: s.title || "", explanation: s.explanation || "", instructions: s.instructions || "",
    elements: (s.svg_elements || []).map((e) => ({ id: e.id, type: e.type, ...e.data })),
    cotas: (s.cotas || []).map((c) => ({ id: c.id, label: c.label, formula: c.formula, orientation: c.orientation, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 })),
  }));
}
async function saveStepContent(db, stepId, elements, cotas) {
  await db.del(`svg_elements?step_id=eq.${stepId}`);
  await db.del(`cotas?step_id=eq.${stepId}`);
  if (elements.length) await db.post("svg_elements", elements.map((el) => { const { id, type, ...rest } = el; return { id, step_id: stepId, type, data: rest }; }));
  if (cotas.length) await db.post("cotas", cotas.map((c) => ({ id: c.id, step_id: stepId, label: c.label, formula: c.formula, orientation: c.orientation, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 })));
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState("");
  const [session, setSession] = useState(null); // { token, refreshToken, userId }
  const [profile, setProfile] = useState(null);
  const [authScreen, setAuthScreen] = useState(null);
  const [tab, setTab] = useState("catalogo");
  const [route, setRoute] = useState({ type: "list" });
  const [mode, setMode] = useState("client");

  const [patterns, setPatterns] = useState([]);
  const [stepsByPattern, setStepsByPattern] = useState({});
  const [variables, setVariables] = useState(DEFAULT_VARIABLES);
  const [measurements, setMeasurements] = useState({});
  const [favorites, setFavorites] = useState([]);
  const [progress, setProgress] = useState({});
  const [categoryIdByName, setCategoryIdByName] = useState({});

  const db = makeDb(session?.token || null);

  const loadAppData = useCallback(async (activeDb, userId) => {
    const [cats, vars, pats] = await Promise.all([
      activeDb.get("categories?select=id,name"),
      activeDb.get("variables?select=*"),
      activeDb.get("patterns?select=*,categories(name),steps(id,step_order,title,explanation,instructions,svg_elements(id,type,data),cotas(*))&order=created_at.desc"),
    ]);
    const catMap = {}; cats.forEach((c) => (catMap[c.name] = c.id));
    setCategoryIdByName(catMap);
    setVariables(vars.length ? vars : DEFAULT_VARIABLES);
    setPatterns(pats.map(mapPatternRow));
    const stepsMap = {}; pats.forEach((p) => { stepsMap[p.id] = mapStepsFromRow(p); });
    setStepsByPattern(stepsMap);
    if (userId) {
      const [meas, favs, prog] = await Promise.all([
        activeDb.get(`measurements?user_id=eq.${userId}&select=variable_id,value`),
        activeDb.get(`favorites?user_id=eq.${userId}&select=pattern_id`),
        activeDb.get(`progress?user_id=eq.${userId}&select=pattern_id,step_index`),
      ]);
      const measObj = {}; meas.forEach((m) => (measObj[m.variable_id] = m.value));
      setMeasurements(measObj);
      setFavorites(favs.map((f) => f.pattern_id));
      const progObj = {}; prog.forEach((p) => (progObj[p.pattern_id] = p.step_index));
      setProgress(progObj);
    }
  }, []);

  // Arranque: recupera la sesión guardada en este dispositivo (si la hay) y carga los datos reales de Supabase
  useEffect(() => {
    (async () => {
      try {
        const token = await safeGet("auth:token", false, null);
        const refreshToken = await safeGet("auth:refreshToken", false, null);
        let activeToken = null; let userId = null; let prof = null;

        if (token) {
          try {
            const user = await getUser(token);
            activeToken = token; userId = user.id;
          } catch {
            if (refreshToken) {
              try {
                const data = await sbAuth("token?grant_type=refresh_token", { body: { refresh_token: refreshToken } });
                activeToken = data.access_token; userId = data.user.id;
                await safeSet("auth:token", activeToken, false);
                await safeSet("auth:refreshToken", data.refresh_token, false);
              } catch { /* la sesión guardada ya no es válida */ }
            }
          }
        }

        const activeDb = makeDb(activeToken);
        if (userId) {
          const rows = await activeDb.get(`profiles?id=eq.${userId}&select=*`);
          prof = rows[0] || null;
        }

        await loadAppData(activeDb, userId);

        if (activeToken && userId && prof) setSession({ token: activeToken, refreshToken, userId });
        else { await safeSet("auth:token", null, false); await safeSet("auth:refreshToken", null, false); }
        setProfile(prof);
      } catch (e) {
        console.error("Error al iniciar la app:", e);
        setInitError(e.network ? "No se pudo conectar con Supabase. Comprueba tu conexión a internet." : (e.message || "Error desconocido al iniciar la app."));
      }
      setReady(true);
    })();
  }, [loadAppData]);

  const handleAuthSuccess = async ({ token, refreshToken, profile: prof }) => {
    await safeSet("auth:token", token, false);
    await safeSet("auth:refreshToken", refreshToken, false);
    const activeDb = makeDb(token);
    try { await loadAppData(activeDb, prof.id); } catch (e) { console.error(e); }
    setSession({ token, refreshToken, userId: prof.id });
    setProfile(prof);
    setAuthScreen(null);
  };
  const handleLogout = async () => {
    await safeSet("auth:token", null, false); await safeSet("auth:refreshToken", null, false);
    setSession(null); setProfile(null); setMeasurements({}); setFavorites([]); setProgress({});
    setRoute({ type: "list" }); setTab("catalogo"); setMode("client");
  };

  const toggleFav = async (id) => {
    if (!session) return;
    const isFav = favorites.includes(id);
    setFavorites((prev) => (isFav ? prev.filter((x) => x !== id) : [...prev, id]));
    try {
      if (isFav) await db.del(`favorites?user_id=eq.${session.userId}&pattern_id=eq.${id}`);
      else await db.post("favorites", { user_id: session.userId, pattern_id: id });
    } catch { setFavorites((prev) => (isFav ? [...prev, id] : prev.filter((x) => x !== id))); }
  };
  const saveProgress = useCallback((patternId, stepIndex) => {
    setProgress((prev) => ({ ...prev, [patternId]: stepIndex }));
    if (session) makeDb(session.token).upsert("progress", [{ user_id: session.userId, pattern_id: patternId, step_index: stepIndex }], "user_id,pattern_id").catch(() => {});
  }, [session]);

  const updateVariables = async (next) => {
    const removed = variables.filter((v) => !next.some((n) => n.id === v.id));
    try {
      for (const v of removed) await db.del(`variables?id=eq.${v.id}`);
      const rows = next.map((v) => ({ id: v.id, label: v.label, unit: v.unit || "cm", image: v.image ?? null }));
      if (rows.length) await db.upsert("variables", rows, "id");
      setVariables(next);
    } catch (e) { console.error(e); }
  };
  const updatePatterns = async (next) => {
    const removed = patterns.filter((p) => !next.some((n) => n.id === p.id));
    try {
      for (const p of removed) await db.del(`patterns?id=eq.${p.id}`);
      for (const p of next) {
        const row = { id: p.id, name: p.name, category_id: categoryIdByName[p.category] || null, level: p.level, duration: p.duration, is_premium: !!p.isPremium, published: !!p.published, description: p.description || "", image: p.image ?? null };
        const exists = patterns.some((x) => x.id === p.id);
        if (exists) await db.patch(`patterns?id=eq.${p.id}`, row); else await db.post("patterns", row);
      }
      setPatterns(next);
    } catch (e) { console.error(e); }
  };
  const updateSteps = async (patternId, next) => {
    const prevSteps = stepsByPattern[patternId] || [];
    const removed = prevSteps.filter((s) => !next.some((n) => n.id === s.id));
    try {
      for (const s of removed) await db.del(`steps?id=eq.${s.id}`);
      const existingIds = next.filter((s) => prevSteps.some((p) => p.id === s.id)).map((s) => s.id);
      for (let i = 0; i < existingIds.length; i++) await db.patch(`steps?id=eq.${existingIds[i]}`, { step_order: -(i + 1) });
      for (let i = 0; i < next.length; i++) {
        const s = next[i];
        const row = { id: s.id, pattern_id: patternId, step_order: i + 1, title: s.title || "", explanation: s.explanation || "", instructions: s.instructions || "" };
        const exists = prevSteps.some((p) => p.id === s.id);
        if (exists) await db.patch(`steps?id=eq.${s.id}`, row); else await db.post("steps", row);
        await saveStepContent(db, s.id, s.elements || [], s.cotas || []);
      }
      setStepsByPattern((prev) => ({ ...prev, [patternId]: next.map((s, i) => ({ ...s, order: i + 1 })) }));
    } catch (e) { console.error(e); }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.paper }}>
        <style>{FONT_IMPORT}</style>
        <Scissors size={28} color={T.accent} className="animate-pulse" />
      </div>
    );
  }

  if (initError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: T.paper }}>
        <style>{FONT_IMPORT}</style>
        <AlertCircle size={28} color={T.accent} />
        <p className="mt-3 text-[14px] font-semibold" style={{ color: T.ink }}>No se pudo iniciar la app</p>
        <p className="mt-1 text-[12.5px]" style={{ color: T.inkMuted }}>{initError}</p>
        <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: T.thread, color: "#FFF9F0" }}>Reintentar</button>
      </div>
    );
  }

  if (!profile && !authScreen) {
    return (<div style={{ fontFamily: "'Inter',sans-serif" }}><style>{FONT_IMPORT}</style>
      <WelcomeScreen onRegister={() => setAuthScreen("register")} onLogin={() => setAuthScreen("login")} /></div>);
  }
  if (!profile && authScreen) {
    return (<div style={{ fontFamily: "'Inter',sans-serif" }}><style>{FONT_IMPORT}</style>
      <AuthScreen mode={authScreen} onBack={() => setAuthScreen(null)} onSuccess={handleAuthSuccess} /></div>);
  }

  if (mode === "admin" && profile.role !== "admin") {
    setMode("client");
    return null;
  }
  if (mode === "admin") {
    return (<div style={{ fontFamily: "'Inter',sans-serif" }}><style>{FONT_IMPORT}</style>
      <AdminRoot patterns={patterns} stepsByPattern={stepsByPattern} variables={variables} onExit={() => setMode("client")}
        updatePatterns={updatePatterns} updateSteps={updateSteps} updateVariables={updateVariables} /></div>);
  }

  const clientPatterns = patterns.filter((p) => p.published !== false);
  const hasPremiumAccess = (pat) => !pat?.isPremium || profile.role === "admin" || !!profile.isPremium;
  const openPattern = (id) => setRoute({ type: "detail", id });
  const startSteps = (id, idx) => { const pat = patterns.find((p) => p.id === id); if (!hasPremiumAccess(pat)) return; setRoute({ type: "steps", id, idx }); };
  const backToList = () => setRoute({ type: "list" });

  let content = null;
  if (route.type === "steps") {
    const pattern = patterns.find((p) => p.id === route.id);
    if (!hasPremiumAccess(pattern)) { content = null; setRoute({ type: "detail", id: route.id }); }
    else content = <StepViewerScreen pattern={pattern} steps={stepsByPattern[route.id] || []} initialIndex={route.idx || 0} values={measurements} variables={variables} onBack={() => setRoute({ type: "detail", id: route.id })} onProgress={saveProgress} />;
  } else if (route.type === "detail") {
    const pattern = patterns.find((p) => p.id === route.id);
    content = <PatternDetailScreen pattern={pattern} steps={stepsByPattern[route.id] || []} progress={progress} onBack={backToList} onStart={startSteps} isFav={favorites.includes(pattern.id)} onToggleFav={toggleFav} hasAccess={hasPremiumAccess(pattern)} />;
  } else if (tab === "catalogo") {
    content = <CatalogScreen patterns={clientPatterns} favorites={favorites} onToggleFav={toggleFav} onOpenPattern={openPattern} />;
  } else if (tab === "medidas") {
    content = <MedidasScreen measurements={measurements} setMeasurements={setMeasurements} variables={variables} db={db} userId={session?.userId} />;
  } else if (tab === "favoritos") {
    content = <FavoritesScreen patterns={clientPatterns} favorites={favorites} onToggleFav={toggleFav} onOpenPattern={openPattern} />;
  } else if (tab === "perfil") {
    content = <ProfileScreen profile={profile} setProfile={setProfile} db={db} onEnterAdmin={() => setMode("admin")} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen" style={{ background: T.paper, fontFamily: "'Inter',sans-serif" }}>
      <style>{`${FONT_IMPORT}
        .no-scrollbar::-webkit-scrollbar{display:none}
        .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      {content}
      {route.type === "list" && <BottomNav active={tab} onChange={setTab} />}
    </div>
  );
}
