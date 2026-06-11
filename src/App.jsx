import { useState, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, update, remove } from "firebase/database";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

// ── FIREBASE ──────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCnWg6Y2THauxyM4yk_QqhOcyybU0-WRI4",
  authDomain: "moorea-qualite.firebaseapp.com",
  projectId: "moorea-qualite",
  storageBucket: "moorea-qualite.firebasestorage.app",
  messagingSenderId: "780115511682",
  appId: "1:780115511682:web:027c3f58f2554b2bc6279b",
  databaseURL: "https://moorea-qualite-default-rtdb.europe-west1.firebasedatabase.app"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// ── EMAILJS ───────────────────────────────────────────────────────────────────
const EMAILJS_SERVICE_ID = "service_xheyrpi";
const EMAILJS_TEMPLATE_ID = "template_ct6xaeg";
const EMAILJS_PUBLIC_KEY = "ZwcIMzI6JE0IkLZ8O";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const C = {
  bg: "#f5f3ee", header: "#0a0a0a", white: "#ffffff",
  green: "#27ae60", greenDark: "#1a6b3a", greenLight: "#eafaf1", greenBorder: "#d4edda",
  gold: "#c8a84b", goldLight: "#faf8f3", goldBorder: "#e8e0d0",
  red: "#fef2f2", redText: "#dc2626", redBorder: "#fca5a5",
  amber: "#fffbeb", amberText: "#d97706", amberBorder: "#fcd34d",
  text: "#1a2e1a", textMuted: "#6b7280",
};

const NOTE_LABELS: Record<number, string> = { 1: "Insuffisant", 2: "Passable", 3: "Correct", 4: "Bon", 5: "Excellent" };
const NOTE_COLORS: Record<number, string> = { 1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#22c55e", 5: "#15803d" };
const NOTE_BG: Record<number, string> = { 1: "#fef2f2", 2: "#fff7ed", 3: "#fefce8", 4: "#f0fdf4", 5: "#dcfce7" };

const CRITERES = [
  { id: "qualite", label: "Qualité visuelle", icon: "👁", accent: "#22c55e" },
  { id: "couleur", label: "Couleur", icon: "🎨", accent: "#f59e0b" },
  { id: "emballage", label: "État emballage", icon: "📦", accent: "#3b82f6" },
];

const ETIQUETTE_ITEMS = [
  { id: "nom_produit", label: "Nom du produit" },
  { id: "poids_etiq", label: "Poids" },
  { id: "origine", label: "Origine en français" },
  { id: "ggn", label: "GGN" },
  { id: "num_lot", label: "Numéro de lot" },
];

const INIT_RAPPORT = {
  qualite: 0, couleur: 0, emballage: 0,
  temperature: "", poids_mesure: "",
  poidsStatut: "", poidsEcart: "",
  etiquetteAbsente: false,
  etiquette: { nom_produit: true, poids_etiq: true, origine: true, ggn: true, num_lot: true },
  controles: { temperature: "C", fraicheur: "C", sanitaire: "C", maturite: "C", coloration: "C" },
  conformite: "", decision: "",
  nbColisAEcarter: "", observations: "",
  photos: [] as { name: string; url: string }[],
  agreeur: "",
};

const INIT_FORM = {
  fournisseur: "", produit: "", variete: "", origine: "",
  quantite: "", unite: "colis", lot_interne: "", lot_fournisseur: "",
  poids_colis: "", temp_annoncee: "",
};

const inputStyle: React.CSSProperties = {
  border: `1.5px solid ${C.goldBorder}`, borderRadius: 10, padding: "10px 12px",
  fontSize: 14, color: C.text, background: C.white, width: "100%",
  boxSizing: "border-box", outline: "none", fontFamily: "system-ui,sans-serif",
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string; label: string }> = {
    "en attente": { bg: C.amber, color: C.amberText, border: C.amberBorder, label: "En attente" },
    "validé": { bg: C.greenLight, color: C.greenDark, border: C.greenBorder, label: "Validé ✓" },
    "refusé": { bg: C.red, color: C.redText, border: C.redBorder, label: "Litige refus" },
    "sous réserve": { bg: "#fffbeb", color: "#92400e", border: "#fcd34d", label: "Sous réserve" },
  };
  const s = map[status] || map["en attente"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
      {s.label}
    </span>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ background: color ? color + "18" : "#f4f7f5", border: `1px solid ${color ? color + "33" : C.greenBorder}`, color: color || C.greenDark, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20 }}>
      {children}
    </span>
  );
}

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{ background: C.white, borderRadius: 14, padding: "14px 16px", flex: 1, boxShadow: "0 2px 12px rgba(0,0,0,0.05)", borderTop: `3px solid ${color || C.goldBorder}` }}>
      <p style={{ margin: "0 0 2px", fontSize: 11, color: C.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: color || C.greenDark, letterSpacing: "-1px" }}>{value}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 11, color: C.textMuted }}>{sub}</p>}
    </div>
  );
}

function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}{required && <span style={{ color: C.redText, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function NoteBtn({ n, selected, onChange }: { n: number; selected: number; onChange: (n: number) => void }) {
  const active = selected === n;
  return (
    <button onClick={() => onChange(n)} style={{
      width: 38, height: 38, borderRadius: 9, cursor: "pointer", fontSize: 13,
      fontWeight: active ? 700 : 400, border: `1.5px solid ${active ? NOTE_COLORS[n] : "#e5e7eb"}`,
      background: active ? NOTE_BG[n] : "#fff", color: active ? NOTE_COLORS[n] : "#9ca3af", transition: "all 0.12s"
    }}>{n}</button>
  );
}

// ── PRODUIT ROW (accordéon arrivages) ────────────────────────────────────────
function ProduitRow({ arrivage, onValidate, onDelete, onOuvreRapport }: {
  arrivage: any; onValidate: (a: any, ctrl: any, dec: string, type: string, raison: string, pct: string) => void;
  onDelete: (id: string) => void; onOuvreRapport: (a: any) => void;
}) {
  const [qualite, setQualite] = useState(3);
  const [tempOk, setTempOk] = useState(true);
  const [poidsOk, setPoidsOk] = useState(true);
  const [litige, setLitige] = useState(false);
  const [raison, setRaison] = useState("");
  const [saving, setSaving] = useState(false);

  const handleValider = async () => {
    setSaving(true);
    const ctrl = { qualite, temperature: tempOk ? "ok" : "ko", poids_mesure: poidsOk ? "ok" : "ko", observations: "" };
    await onValidate(arrivage, ctrl, litige ? "non_conforme" : "conforme", litige ? "sous réserve" : "", raison, "");
    setSaving(false);
  };

  const statusColor = litige ? C.redText : qualite >= 4 ? C.green : qualite === 3 ? C.amberText : C.redText;

  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", marginBottom: 8, border: `1.5px solid ${litige ? C.redBorder : C.greenBorder}`, borderLeft: `4px solid ${statusColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13, color: C.text }}>{arrivage.produit}{arrivage.variete ? ` · ${arrivage.variete}` : ""}</p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
            <Pill>📦 {arrivage.quantite} {arrivage.unite}</Pill>
            {arrivage.lot_interne && <Pill>🔖 {arrivage.lot_interne}</Pill>}
            {arrivage.origine && <Pill>🌍 {arrivage.origine}</Pill>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => onOuvreRapport(arrivage)} title="Rapport complet"
            style={{ background: C.goldLight, border: `1px solid ${C.goldBorder}`, color: C.gold, borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
            📋 Rapport
          </button>
          <button onClick={() => onDelete(arrivage.id)}
            style={{ background: "transparent", border: `1px solid ${C.redBorder}`, color: C.redText, borderRadius: 8, padding: "3px 7px", cursor: "pointer", fontSize: 11 }}>🗑</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr auto", gap: "0 12px", alignItems: "center", marginBottom: 8 }}>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>👁 Qualité</p>
          <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3, 4, 5].map(n => <NoteBtn key={n} n={n} selected={qualite} onChange={setQualite} />)}
          </div>
        </div>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const }}>🌡 Temp.</p>
          <div style={{ display: "flex", gap: 5 }}>
            {[{ v: true, l: "✓ Ok", ac: C.green }, { v: false, l: "✗ Non", ac: C.redText }].map(o => (
              <button key={String(o.v)} onClick={() => setTempOk(o.v)}
                style={{ padding: "5px 9px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: tempOk === o.v ? 700 : 400, border: `1.5px solid ${tempOk === o.v ? o.ac : "#e5e7eb"}`, background: tempOk === o.v ? o.ac + "18" : "#fff", color: tempOk === o.v ? o.ac : "#9ca3af" }}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const }}>⚖️ Poids</p>
          <div style={{ display: "flex", gap: 5 }}>
            {[{ v: true, l: "✓ Ok", ac: C.green }, { v: false, l: "✗ Non", ac: C.redText }].map(o => (
              <button key={String(o.v)} onClick={() => setPoidsOk(o.v)}
                style={{ padding: "5px 9px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: poidsOk === o.v ? 700 : 400, border: `1.5px solid ${poidsOk === o.v ? o.ac : "#e5e7eb"}`, background: poidsOk === o.v ? o.ac + "18" : "#fff", color: poidsOk === o.v ? o.ac : "#9ca3af" }}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const }}>⚠️ Litige</p>
          <div style={{ display: "flex", gap: 5 }}>
            {[{ v: false, l: "✓ Non", ac: C.green }, { v: true, l: "✗ Oui", ac: C.redText }].map(o => (
              <button key={String(o.v)} onClick={() => setLitige(o.v)}
                style={{ padding: "5px 9px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: litige === o.v ? 700 : 400, border: `1.5px solid ${litige === o.v ? o.ac : "#e5e7eb"}`, background: litige === o.v ? o.ac + "18" : "#fff", color: litige === o.v ? o.ac : "#9ca3af" }}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {litige && (
        <input value={raison} onChange={e => setRaison(e.target.value)}
          placeholder="Raison du litige..." style={{ ...inputStyle, marginBottom: 8, fontSize: 13 }} />
      )}

      <button onClick={handleValider} disabled={saving || (litige && !raison)}
        style={{ width: "100%", padding: "9px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, border: "none", background: saving ? "#ccc" : litige ? C.redText : C.green, color: "#fff" }}>
        {saving ? "..." : litige ? "📋 Valider + litige →" : "✅ Valider →"}
      </button>
    </div>
  );
}

function FournisseurBlock({ fournisseur, produits, onValidate, onDelete, onOuvreRapport }: any) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: C.white, borderRadius: 14, marginBottom: 10, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <div onClick={() => setOpen(!open)} style={{ padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: C.goldLight, borderBottom: open ? `1px solid ${C.goldBorder}` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>🏭</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{fournisseur}</span>
          <span style={{ fontSize: 12, background: C.amber, color: C.amberText, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>{produits.length} article{produits.length > 1 ? "s" : ""}</span>
        </div>
        <span style={{ fontSize: 18, color: C.gold, fontWeight: 700, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>›</span>
      </div>
      {open && (
        <div style={{ padding: "12px 14px" }}>
          {produits.map((a: any) => <ProduitRow key={a.id} arrivage={a} onValidate={onValidate} onDelete={onDelete} onOuvreRapport={onOuvreRapport} />)}
        </div>
      )}
    </div>
  );
}

function DateBlock({ date, arrivages, onValidate, onDelete, onOuvreRapport }: any) {
  const [open, setOpen] = useState(true);
  const byFournisseur: Record<string, any[]> = {};
  arrivages.forEach((a: any) => {
    if (!byFournisseur[a.fournisseur]) byFournisseur[a.fournisseur] = [];
    byFournisseur[a.fournisseur].push(a);
  });
  return (
    <div style={{ marginBottom: 16 }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, cursor: "pointer", userSelect: "none" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>📅 {date}</span>
        <span style={{ fontSize: 12, background: C.amber, color: C.amberText, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>{arrivages.length} en attente</span>
        <span style={{ fontSize: 16, color: C.amberText, marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>›</span>
      </div>
      {open && Object.entries(byFournisseur).map(([f, produits]) => (
        <FournisseurBlock key={f} fournisseur={f} produits={produits} onValidate={onValidate} onDelete={onDelete} onOuvreRapport={onOuvreRapport} />
      ))}
    </div>
  );
}

// ── RAPPORT FORM (formulaire qualité complet) ─────────────────────────────────
function RapportForm({ arrivage, user, rapports, onSave, onCancel }: {
  arrivage: any; user: any; rapports: any[];
  onSave: (rapport: any) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({ ...INIT_RAPPORT, agreeur: user?.displayName?.split(" ")[0] || "" });
  const [sending, setSending] = useState(false);
  const [scanning, setScanning] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  const score = (() => {
    const { qualite, couleur, emballage } = form;
    if (qualite > 0 && couleur > 0 && emballage > 0) return (qualite * 0.4 + couleur * 0.4 + emballage * 0.2).toFixed(1);
    const vals = [qualite, couleur, emballage].filter(v => v > 0);
    if (!vals.length) return null;
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  })();

  const totalColis = form.nbColisAEcarter ? arrivage.quantite : null;
  const nbRefuses = form.nbColisAEcarter ? parseInt(form.nbColisAEcarter) : null;
  const pctRefuses = nbRefuses && arrivage.quantite ? Math.round(nbRefuses / parseInt(arrivage.quantite) * 100) : null;

  const uploadPhotos = async (photos: { name: string; url: string }[]) => {
    const KEY = "06c9cef29906bf8f060e882ed5540240";
    const urls: string[] = [];
    for (const p of photos) {
      try {
        const base64 = p.url.split(",")[1];
        const fd = new FormData(); fd.append("image", base64);
        const r = await fetch(`https://api.imgbb.com/1/upload?key=${KEY}`, { method: "POST", body: fd });
        const d = await r.json();
        if (d.success) urls.push(d.data.url);
      } catch {}
    }
    return urls;
  };

  const handleSubmit = async () => {
    if (!form.conformite) { alert("Choisissez une conformité"); return; }
    setSending(true);
    const now = new Date();
    const date = now.toLocaleDateString("fr-FR");
    const heure = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    const weekNum = Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7);
    const sameWeek = rapports.filter(r => r.numeroRapport?.startsWith(`S${String(weekNum).padStart(2, "0")}-${now.getFullYear()}`)).length + 1;
    const numeroRapport = `S${String(weekNum).padStart(2, "0")}-${now.getFullYear()}-${String(sameWeek).padStart(3, "0")}`;

    const decision = form.conformite === "conforme" ? "stock" : form.decision;

    let photoUrls: string[] = [];
    if (form.photos.length > 0) photoUrls = await uploadPhotos(form.photos);

    const rapport = {
      arrivage_id: arrivage.id,
      numeroRapport,
      fournisseur: arrivage.fournisseur,
      produit: arrivage.produit,
      variete: arrivage.variete || "",
      origine: arrivage.origine || "",
      lotMoorea: arrivage.lot_interne || "",
      lotFournisseur: arrivage.lot_fournisseur || "",
      quantite: arrivage.quantite,
      unite: arrivage.unite,
      agreeur: form.agreeur,
      temperature: form.temperature,
      poids_mesure: form.poids_mesure,
      notes: { qualite: form.qualite, couleur: form.couleur, emballage: form.emballage },
      conformite: form.conformite,
      decision,
      nbColisAEcarter: form.nbColisAEcarter,
      nbColisRefuses: nbRefuses,
      nbColisTotal: arrivage.quantite,
      pourcentage: pctRefuses?.toString() || "",
      poidsStatut: form.poidsStatut,
      poidsEcart: form.poidsEcart,
      etiquetteAbsente: form.etiquetteAbsente,
      etiquette: form.etiquette,
      controles: form.controles,
      observations: form.observations,
      score,
      photoUrls,
      nbPhotos: photoUrls.length,
      date,
      heure,
      timestamp: Date.now(),
    };

    await onSave(rapport);
    setSending(false);
  };

  const scannerEtiquette = async (file: File) => {
    setScanning(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          if (w > 800 || h > 800) { if (w > h) { h = Math.round(h * 800 / w); w = 800; } else { w = Math.round(w * 800 / h); h = 800; } }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.8).split(",")[1]);
        };
        img.src = URL.createObjectURL(file);
      });
      const res = await fetch("/api/scan-etiquette", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base64, mediaType: file.type }) });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      if (parsed.produit) {} // already in arrivage
      setScanning(false);
    } catch { setScanning(false); }
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ background: C.header, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `3px solid ${C.gold}`, position: "sticky", top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: C.gold }}>📋 Rapport agréage</p>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{arrivage.produit} · {arrivage.fournisseur}</p>
        </div>
        <button onClick={onCancel} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>← Retour</button>
      </div>

      <div style={{ maxWidth: 740, margin: "0 auto", padding: "20px 16px 60px" }}>

        {/* Infos arrivage */}
        <div style={{ background: C.white, border: `1.5px solid ${C.goldBorder}`, borderRadius: 16, padding: "14px 18px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15, color: C.text }}>{arrivage.produit}{arrivage.variete ? ` · ${arrivage.variete}` : ""}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            <Pill>🏭 {arrivage.fournisseur}</Pill>
            <Pill>📦 {arrivage.quantite} {arrivage.unite}</Pill>
            {arrivage.lot_interne && <Pill>🔖 {arrivage.lot_interne}</Pill>}
            {arrivage.origine && <Pill>🌍 {arrivage.origine}</Pill>}
          </div>
        </div>

        {/* Agréeur */}
        <div style={{ background: "#0a0a0a", border: `2px solid ${C.gold}`, borderRadius: 16, padding: "14px 20px", marginBottom: 16 }}>
          <F label="Nom de l'agréeur">
            <input value={form.agreeur} onChange={e => setForm({ ...form, agreeur: e.target.value })}
              placeholder="Votre nom" style={{ ...inputStyle, border: `1.5px solid ${C.gold}44`, background: "#1a1a1a", color: "#fff" }} />
          </F>
        </div>

        {/* Scanner étiquette */}
        <div style={{ background: C.white, border: `1.5px solid ${C.goldBorder}`, borderRadius: 16, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#f0f4ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🔍</div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 13, color: C.text }}>Scanner l'étiquette</p>
            <p style={{ margin: 0, fontSize: 11, color: C.textMuted }}>L'IA analyse et remplit les champs automatiquement</p>
          </div>
          <label style={{ padding: "9px 16px", background: scanning ? "#d1d5db" : "linear-gradient(135deg,#3b82f6,#1d4ed8)", color: "#fff", borderRadius: 10, cursor: scanning ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, pointerEvents: scanning ? "none" : "auto" as const }}>
            {scanning ? "⏳…" : "📷 Scanner"}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) scannerEtiquette(f); e.target.value = ""; }} />
          </label>
        </div>

        {/* Colis */}
        <div style={{ background: C.white, border: `1.5px solid ${C.goldBorder}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>📦 Colis</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <F label="Colis attendus"><input type="number" value={arrivage.quantite} readOnly style={{ ...inputStyle, background: "#f9f9f9", color: C.textMuted }} /></F>
            <F label="Température réception (°C)">
              <input type="number" step="0.1" value={form.temperature} onChange={e => setForm({ ...form, temperature: e.target.value })} placeholder="Ex : 4" style={inputStyle} />
            </F>
          </div>
        </div>

        {/* Notes qualité */}
        <div style={{ background: C.white, border: `1.5px solid ${C.goldBorder}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 14px", fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>👁 Évaluation qualité</p>
          {CRITERES.map(c => (
            <div key={c.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: c.accent + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{c.icon}</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.label}</span>
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                {[1, 2, 3, 4, 5].map(n => <NoteBtn key={n} n={n} selected={(form as any)[c.id]} onChange={v => setForm({ ...form, [c.id]: v })} />)}
                {(form as any)[c.id] > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: NOTE_COLORS[(form as any)[c.id]], marginLeft: 4 }}>{NOTE_LABELS[(form as any)[c.id]]}</span>}
              </div>
            </div>
          ))}

          {score && (
            <div style={{ background: `linear-gradient(135deg,${C.greenLight},#dcfce7)`, borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 11, color: "#8a6f2e", fontWeight: 700, textTransform: "uppercase" as const }}>Score global</p>
                <p style={{ margin: 0, fontSize: 12, color: C.textMuted }}>{NOTE_LABELS[Math.round(parseFloat(score))]}</p>
              </div>
              <span style={{ fontSize: 28, fontWeight: 800, color: NOTE_COLORS[Math.round(parseFloat(score))] }}>{score}<span style={{ fontSize: 13, fontWeight: 400, color: C.textMuted }}>/5</span></span>
            </div>
          )}
        </div>

        {/* Poids */}
        <div style={{ background: C.white, border: `1.5px solid ${C.goldBorder}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const }}>⚖️ Poids</p>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            {[{ id: "ok", l: "✓ Poids OK", c: C.green }, { id: "ecart", l: "⚠ Écart", c: C.amberText }].map(o => (
              <button key={o.id} onClick={() => setForm({ ...form, poidsStatut: o.id })}
                style={{ flex: 1, padding: "10px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, border: `2px solid ${form.poidsStatut === o.id ? o.c : "#e5e7eb"}`, background: form.poidsStatut === o.id ? o.c + "18" : "#fff", color: form.poidsStatut === o.id ? o.c : C.textMuted }}>
                {o.l}
              </button>
            ))}
          </div>
          {form.poidsStatut === "ecart" && (
            <F label="Écart moyen par colis (g)">
              <input type="number" value={form.poidsEcart} onChange={e => setForm({ ...form, poidsEcart: e.target.value })} placeholder="Ex : 120" style={inputStyle} />
            </F>
          )}
        </div>

        {/* Contrôles C/NC */}
        <div style={{ background: C.white, border: `1.5px solid ${C.goldBorder}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const }}>✅ Contrôles qualité</p>
          <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 }}>
            <thead><tr style={{ background: "#f5f3ee" }}>
              <th style={{ padding: "8px 12px", textAlign: "left" as const, fontSize: 11, color: "#8a6f2e", textTransform: "uppercase" as const }}>Critère</th>
              <th style={{ padding: "8px 12px", textAlign: "center" as const, width: 60, color: C.green }}>C</th>
              <th style={{ padding: "8px 12px", textAlign: "center" as const, width: 60, color: C.redText }}>NC</th>
            </tr></thead>
            <tbody>
              {[{ id: "temperature", l: "Température" }, { id: "fraicheur", l: "Fraîcheur" }, { id: "sanitaire", l: "Sanitaire" }, { id: "maturite", l: "Maturité" }, { id: "coloration", l: "Coloration" }].map((item, idx) => (
                <tr key={item.id} style={{ background: idx % 2 === 0 ? "#faf8f5" : "#fff", borderBottom: "1px solid #f0ede6" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500, color: "#374151" }}>{item.l}</td>
                  {["C", "NC"].map(v => (
                    <td key={v} style={{ padding: "10px 12px", textAlign: "center" as const }}>
                      <button onClick={() => setForm({ ...form, controles: { ...form.controles, [item.id]: form.controles[item.id as keyof typeof form.controles] === v ? "" : v } })}
                        style={{ width: 32, height: 32, borderRadius: 8, border: `2px solid ${form.controles[item.id as keyof typeof form.controles] === v ? (v === "C" ? C.green : C.redText) : "#e5e7eb"}`, background: form.controles[item.id as keyof typeof form.controles] === v ? (v === "C" ? C.green : C.redText) : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                        {form.controles[item.id as keyof typeof form.controles] === v && <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{v === "C" ? "✓" : "✕"}</span>}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Étiquette */}
        <div style={{ background: C.white, border: `1.5px solid ${C.goldBorder}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const }}>🏷️ Conformité étiquette</p>
          <label onClick={() => setForm({ ...form, etiquetteAbsente: !form.etiquetteAbsente })}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, cursor: "pointer", marginBottom: 10, background: form.etiquetteAbsente ? C.red : "#f9fafb", border: `2px solid ${form.etiquetteAbsente ? C.redText : "#e5e7eb"}` }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: form.etiquetteAbsente ? C.redText : "#fff", border: `2px solid ${form.etiquetteAbsente ? C.redText : "#d1d5db"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {form.etiquetteAbsente && <span style={{ color: "#fff", fontSize: 13 }}>✕</span>}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: form.etiquetteAbsente ? C.redText : C.textMuted }}>Étiquette absente</span>
          </label>
          {!form.etiquetteAbsente && ETIQUETTE_ITEMS.map(item => (
            <label key={item.id} onClick={() => setForm({ ...form, etiquette: { ...form.etiquette, [item.id]: !form.etiquette[item.id as keyof typeof form.etiquette] } })}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, cursor: "pointer", marginBottom: 6, background: form.etiquette[item.id as keyof typeof form.etiquette] ? "#f0fdf4" : C.red, border: `1.5px solid ${form.etiquette[item.id as keyof typeof form.etiquette] ? "#bbf7d0" : C.redBorder}` }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: form.etiquette[item.id as keyof typeof form.etiquette] ? C.green : "#fff", border: `2px solid ${form.etiquette[item.id as keyof typeof form.etiquette] ? C.green : C.redBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {form.etiquette[item.id as keyof typeof form.etiquette] && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
              </div>
              <span style={{ fontSize: 13, color: form.etiquette[item.id as keyof typeof form.etiquette] ? C.greenDark : C.redText }}>{item.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: form.etiquette[item.id as keyof typeof form.etiquette] ? C.green : C.redText }}>{form.etiquette[item.id as keyof typeof form.etiquette] ? "Présent" : "Manquant"}</span>
            </label>
          ))}
        </div>

        {/* Photos */}
        <div style={{ background: C.white, border: `1.5px solid ${C.goldBorder}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const }}>📷 Photos</p>
          <label style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8, border: "2px dashed #e8e0d0", borderRadius: 12, padding: "20px", background: "#faf8f5", cursor: "pointer", marginBottom: form.photos.length ? 12 : 0 }}>
            <span style={{ fontSize: 24 }}>📷</span>
            <span style={{ fontSize: 13, color: "#8a6f2e", fontWeight: 600 }}>Ajouter des photos</span>
            <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => {
              Array.from(e.target.files || []).forEach(file => {
                const reader = new FileReader();
                reader.onload = ev => {
                  const img = new Image();
                  img.onload = () => {
                    const canvas = document.createElement("canvas");
                    let w = img.width, h = img.height;
                    if (w > 1200 || h > 1200) { if (w > h) { h = Math.round(h * 1200 / w); w = 1200; } else { w = Math.round(w * 1200 / h); h = 1200; } }
                    canvas.width = w; canvas.height = h;
                    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
                    setForm(prev => ({ ...prev, photos: [...prev.photos, { name: file.name, url: canvas.toDataURL("image/jpeg", 0.75) }] }));
                  };
                  img.src = ev.target?.result as string;
                };
                reader.readAsDataURL(file);
              });
              e.target.value = "";
            }} />
          </label>
          {form.photos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {form.photos.map((p, i) => (
                <div key={i} style={{ position: "relative" as const, borderRadius: 8, overflow: "hidden", aspectRatio: "1" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} />
                  <button onClick={() => setForm(prev => ({ ...prev, photos: prev.photos.filter((_, j) => j !== i) }))}
                    style={{ position: "absolute" as const, top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 13, cursor: "pointer" }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conformité + decision */}
        <div style={{ background: C.white, border: `1.5px solid ${C.goldBorder}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const }}>📋 Commentaire & Conformité</p>
          <F label="Commentaire">
            <textarea value={form.observations} onChange={e => setForm({ ...form, observations: e.target.value })} rows={3} placeholder="Remarques..." style={{ ...inputStyle, resize: "vertical" as const }} />
          </F>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            {[{ v: "conforme", l: "✅ Conforme", c: C.green }, { v: "non_conforme", l: "❌ Non conforme", c: C.redText }].map(o => (
              <button key={o.v} onClick={() => setForm({ ...form, conformite: o.v, decision: "" })}
                style={{ flex: 1, padding: "14px", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 14, border: `2px solid ${form.conformite === o.v ? o.c : "#e5e7eb"}`, background: form.conformite === o.v ? o.c + "18" : "#fff", color: form.conformite === o.v ? o.c : C.textMuted }}>
                {o.l}
              </button>
            ))}
          </div>
          {form.conformite === "non_conforme" && (
            <div style={{ background: C.red, border: `1px solid ${C.redBorder}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {[{ v: "reserve", l: "⚠️ Réserve", c: C.amberText }, { v: "refus", l: "❌ Refus", c: C.redText }].map(o => (
                  <button key={o.v} onClick={() => setForm({ ...form, decision: o.v })}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, border: `2px solid ${form.decision === o.v ? o.c : "#fca5a5"}`, background: form.decision === o.v ? o.c + "22" : "#fff", color: o.c }}>
                    {o.l}
                  </button>
                ))}
              </div>
              {(form.decision === "reserve" || form.decision === "refus") && (
                <F label={`Nb colis à ${form.decision === "reserve" ? "mettre en réserve" : "refuser"}`}>
                  <input type="number" value={form.nbColisAEcarter} onChange={e => setForm({ ...form, nbColisAEcarter: e.target.value })}
                    placeholder={`Ex: ${Math.round(parseInt(arrivage.quantite) * 0.2)}`} style={inputStyle} />
                  {pctRefuses !== null && <p style={{ margin: "4px 0 0", fontSize: 12, color: C.redText, fontWeight: 600 }}>{nbRefuses} / {arrivage.quantite} colis ({pctRefuses}%)</p>}
                </F>
              )}
            </div>
          )}
        </div>

        <button onClick={handleSubmit} disabled={sending}
          style={{ width: "100%", padding: "14px", background: sending ? "#ccc" : `linear-gradient(135deg,${C.gold},#a8882b)`, color: "#fff", border: "none", borderRadius: 14, fontWeight: 700, fontSize: 16, cursor: sending ? "not-allowed" : "pointer" }}>
          {sending ? "⏳ Envoi…" : "✉ Envoyer le rapport"}
        </button>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<any>(undefined);
  const [page, setPage] = useState("arrivages");
  const [arrivages, setArrivages] = useState<any[]>([]);
  const [rapports, setRapports] = useState<any[]>([]);
  const [form, setForm] = useState(INIT_FORM);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [filters, setFilters] = useState({ q: "", statut: "tous" });
  const [horsListeMode, setHorsListeMode] = useState(false);
  const [horsListe, setHorsListe] = useState({ produit: "", fournisseur: "", lot_interne: "", lot_fournisseur: "", origine: "", quantite: "", unite: "colis", type: "refusé", raison: "", pct: "" });
  const [rapportArrivage, setRapportArrivage] = useState<any | null>(null);
  const [histSearch, setHistSearch] = useState("");
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  useEffect(() => { return onAuthStateChanged(auth, u => setUser(u)); }, []);

  useEffect(() => {
    const u1 = onValue(ref(db, "arrivages"), snap => {
      const data = snap.val();
      if (data) {
        const list = Object.entries(data).map(([id, v]: [string, any]) => ({ ...v, id }));
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setArrivages(list);
      } else setArrivages([]);
    });
    const u2 = onValue(ref(db, "rapports"), snap => {
      const data = snap.val();
      if (data) {
        const list = Object.entries(data).map(([id, v]: [string, any]) => ({ ...v, id }));
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setRapports(list);
      } else setRapports([]);
    });
    return () => { u1(); u2(); };
  }, []);

  const showToast = (msg: string, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const login = async () => {
    try {
      const r = await signInWithPopup(auth, googleProvider);
      if (!r.user.email?.endsWith("@moorea.fr")) { await signOut(auth); alert("Accès réservé @moorea.fr"); }
    } catch (e) { console.error(e); }
  };

  // Arrivages dérivés
  const enAttente = arrivages.filter(a => a.statut === "en attente");
  const archives = arrivages.filter(a => a.statut !== "en attente");

  const filtered = (list: any[]) => list.filter(a => {
    if (filters.q && !`${a.produit} ${a.fournisseur}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.statut !== "tous" && a.statut !== filters.statut) return false;
    return true;
  });

  // Agrément rapide
  const handleAgrement = async (arrivage: any, ctrl: any, decision: string, ncType: string, raison: string, pct: string) => {
    const now = new Date();
    const statut = decision === "conforme" ? "validé" : ncType;
    const rapport = { qualite: ctrl.qualite, temperature: ctrl.temperature, poids_mesure: ctrl.poids_mesure, observations: ctrl.observations, heure_agreage: now.toTimeString().slice(0, 5), date_rapport: now.toLocaleDateString("fr-FR"), agreeur: user?.displayName || "" };
    const litige = decision === "non_conforme" ? { type: ncType, raison, pct: pct || "", lot_fournisseur: arrivage.lot_fournisseur || "", date: now.toLocaleDateString("fr-FR"), statut: "ouvert", createdAt: Date.now() } : null;
    await update(ref(db, `arrivages/${arrivage.id}`), { statut, archived: true, rapport, ...(litige ? { litige } : {}), validatedAt: Date.now() });
    showToast(decision === "conforme" ? "✅ Validé et archivé" : "📋 Rapport + litige créés");
  };

  // Sauvegarde rapport complet
  const handleSaveRapport = async (rapport: any) => {
    await push(ref(db, "rapports"), rapport);
    await update(ref(db, `arrivages/${rapportArrivage.id}`), { statut: rapport.conformite === "conforme" ? "validé" : rapport.decision, archived: true, rapport_id: rapport.numeroRapport, validatedAt: Date.now() });
    setRapportArrivage(null);
    showToast("✓ Rapport enregistré et envoyé");
  };

  // Saisie arrivage
  const submitArrivage = async () => {
    if (!form.fournisseur || !form.produit || !form.quantite) { showToast("Champs requis manquants", "err"); return; }
    const now = new Date();
    await push(ref(db, "arrivages"), { ...form, statut: "en attente", date: now.toLocaleDateString("fr-FR"), timestamp: Date.now() });
    setForm(INIT_FORM); setPage("arrivages"); showToast("Arrivage enregistré ✓");
  };

  const deleteArrivage = async (id: string) => { if (!confirm("Supprimer ?")) return; await remove(ref(db, `arrivages/${id}`)); showToast("Supprimé"); };

  // Excel import
  const handleExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true);
    const now = new Date();
    if (file.name.endsWith(".pdf")) {
      const loadPDF = () => new Promise<any>((res, rej) => {
        if ((window as any).pdfjsLib) { res((window as any).pdfjsLib); return; }
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        s.onload = () => { (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res((window as any).pdfjsLib); };
        s.onerror = rej; document.head.appendChild(s);
      });
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const lib = await loadPDF();
          const pdf = await lib.getDocument({ data: evt.target!.result }).promise;
          let text = "";
          for (let p = 1; p <= pdf.numPages; p++) { const pg = await pdf.getPage(p); const tc = await pg.getTextContent(); text += tc.items.map((i: any) => i.str).join(" ") + "\n"; }
          const arr: any[] = []; let curLot = "", curFourn = "", curDate = now.toLocaleDateString("fr-FR");
          text.split("\n").forEach(line => {
            const lm = line.match(/Lot\s+(\d+)\s+Fournisseur\s+\d+\s+(.+?)\s+Date arriv[eé]e\s+(\d{2}\/\d{2}\/\d{4})/i);
            if (lm) { curLot = lm[1]; curFourn = lm[2].trim().toUpperCase(); curDate = lm[3]; return; }
            const pm = line.match(/^(\d{2})\s+(\S+)\s+(.+?)\s+(\d+)\s+/);
            if (pm && parseInt(pm[1]) >= 1 && parseInt(pm[4]) > 0 && pm[3].trim().length > 3) {
              arr.push({ fournisseur: curFourn, produit: pm[3].trim(), lot_interne: curLot, lot_fournisseur: "", quantite: parseInt(pm[4]), unite: "colis", poids_net: "", origine: "", variete: "", date: curDate, timestamp: Date.now() });
            }
          });
          if (!arr.length) { showToast("Aucun arrivage détecté", "err"); setImporting(false); return; }
          setPreview(arr); setImporting(false);
        } catch { showToast("Erreur PDF", "err"); setImporting(false); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const loadXLSX = () => new Promise<any>((res, rej) => {
          if ((window as any).XLSX) { res((window as any).XLSX); return; }
          const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
          s.onload = () => res((window as any).XLSX); s.onerror = rej; document.head.appendChild(s);
        });
        loadXLSX().then(XLSX => {
          const wb = XLSX.read(evt.target!.result, { type: "array" });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
          const arr: any[] = []; let curLot = "", curFourn = "", curDate = now.toLocaleDateString("fr-FR");
          (rows as any[][]).forEach(row => {
            const c0 = String(row[0] || "").trim(), c1 = String(row[1] || "").trim(), c2 = String(row[2] || "").trim(), c3 = String(row[3] || "").trim(), c7 = String(row[7] || "").trim(), c9 = String(row[9] || "").trim();
            if (c0 === "Lot" && c1) { curLot = c1; if (c2 === "Fournisseur") curFourn = c3.toUpperCase(); if (c7 === "Date arrivée" && c9) { try { const d = new Date(c9); curDate = isNaN(d.getTime()) ? curDate : d.toLocaleDateString("fr-FR"); } catch {} } }
            const nb = parseInt(String(row[4] || "0"));
            if (/^0[0-9]$/.test(c0) && c1 && c2 && nb > 0) arr.push({ fournisseur: curFourn, produit: c2, lot_interne: curLot, lot_fournisseur: "", quantite: nb, unite: "colis", poids_net: String(row[10] || ""), origine: "", variete: "", date: curDate, timestamp: Date.now() });
          });
          if (!arr.length) { showToast("Aucun arrivage détecté", "err"); setImporting(false); return; }
          setPreview(arr); setImporting(false);
        }).catch(() => { showToast("Erreur Excel", "err"); setImporting(false); });
      };
      reader.readAsArrayBuffer(file);
    }
    e.target.value = "";
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    for (const a of preview) await push(ref(db, "arrivages"), { ...a, statut: "en attente", timestamp: Date.now() });
    setPreview(null); setImporting(false); showToast(`${preview.length} arrivages importés ✓`); setPage("arrivages");
  };

  const submitHorsListe = async () => {
    if (!horsListe.produit || !horsListe.fournisseur || !horsListe.raison) { showToast("Produit, fournisseur et raison requis", "err"); return; }
    const now = new Date();
    await push(ref(db, "arrivages"), { ...horsListe, statut: horsListe.type, hors_liste: true, archived: true, date: now.toLocaleDateString("fr-FR"), timestamp: Date.now(), validatedAt: Date.now(), litige: { type: horsListe.type, raison: horsListe.raison, pct: horsListe.pct, lot_fournisseur: horsListe.lot_fournisseur, date: now.toLocaleDateString("fr-FR"), statut: "ouvert", createdAt: Date.now() } });
    setHorsListeMode(false); setHorsListe({ produit: "", fournisseur: "", lot_interne: "", lot_fournisseur: "", origine: "", quantite: "", unite: "colis", type: "refusé", raison: "", pct: "" });
    showToast("Litige hors liste enregistré ✓");
  };

  // PDF génération
  const generatePDF = async (r: any) => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, M = 14, CW = W - M * 2;
    let y = 0;
    const checkY = (n = 10) => { if (y + n > 275) { doc.addPage(); y = 14; } };
    doc.setFillColor(10, 10, 10); doc.rect(0, 0, W, 22, "F");
    doc.setFillColor(200, 168, 75); doc.rect(0, 22, W, 2, "F");
    doc.setTextColor(200, 168, 75); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("MOOREA", M, 14);
    doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.text("Rapport Qualité — Arrivages", M + 32, 14);
    doc.setTextColor(150, 150, 150); doc.setFontSize(8); doc.text(`${r.date} · ${r.heure}`, W - M, 14, { align: "right" });
    if (r.numeroRapport) { doc.setTextColor(200, 168, 75); doc.setFontSize(8); doc.text(r.numeroRapport, W - M, 9, { align: "right" }); }
    y = 32;
    const dc: [number, number, number] = r.decision === "stock" ? [22, 163, 74] : r.decision === "reserve" ? [217, 119, 6] : [220, 38, 38];
    const dl = r.decision === "stock" ? "ENTRÉE EN STOCK" : r.decision === "reserve" ? "RÉSERVE" : "REFUS";
    doc.setFillColor(...dc); doc.roundedRect(M, y, CW, 12, 3, 3, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(dl, W / 2, y + 8, { align: "center" });
    y += 18;
    const section = (t: string) => { checkY(14); doc.setFillColor(245, 243, 238); doc.rect(M, y, CW, 8, "F"); doc.setFillColor(200, 168, 75); doc.rect(M, y, 3, 8, "F"); doc.setTextColor(138, 111, 46); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text(t, M + 6, y + 5.5); y += 12; };
    const row = (l: string, v: string) => { checkY(7); doc.setTextColor(107, 114, 128); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(l + " :", M + 2, y); doc.setTextColor(26, 46, 26); doc.setFont("helvetica", "bold"); doc.text(v || "—", M + 45, y); y += 6; };
    section("INFORMATIONS"); row("Fournisseur", r.fournisseur); row("Produit", r.produit); row("Origine", r.origine || ""); row("Lot Moorea", r.lotMoorea || ""); row("Lot Fournisseur", r.lotFournisseur || ""); if (r.temperature) row("Température", r.temperature + " °C"); y += 4;
    if (r.notes?.qualite > 0) { section("QUALITÉ"); const nc: Record<number, [number, number, number]> = { 1: [239, 68, 68], 2: [249, 115, 22], 3: [234, 179, 8], 4: [34, 197, 94], 5: [21, 128, 61] }; doc.setFillColor(...nc[r.notes.qualite]); doc.roundedRect(M + 2, y - 2, 70, 9, 2, 2, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(`${r.notes.qualite}/5 — ${NOTE_LABELS[r.notes.qualite]}`, M + 6, y + 4.5); y += 14; }
    if (r.observations) { section("COMMENTAIRE"); const lines = doc.splitTextToSize(r.observations, CW - 8); doc.setFillColor(250, 248, 245); doc.roundedRect(M, y - 2, CW, lines.length * 5 + 8, 3, 3, "F"); doc.setTextColor(107, 114, 128); doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.text(lines, M + 4, y + 4); y += lines.length * 5 + 12; }
    doc.setFillColor(10, 10, 10); doc.rect(0, 285, W, 12, "F"); doc.setFillColor(200, 168, 75); doc.rect(0, 285, W, 1, "F"); doc.setTextColor(150, 150, 150); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(`Moorea · Rungis · ${r.date}${r.lotMoorea ? " · Lot " + r.lotMoorea : ""}`, W / 2, 291, { align: "center" });
    const b64 = doc.output("datauristring").split(",")[1];
    const arr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    window.open(URL.createObjectURL(new Blob([arr], { type: "application/pdf" })), "_blank");
  };

  const sendWhatsApp = (r: any) => {
    const dl = r.decision === "stock" ? "✅ Conforme" : r.decision === "reserve" ? "⚠️ Réserve" : "❌ Refus";
    const msg = `🍃 RAPPORT AGRÉAGE MOOREA\n${r.numeroRapport ? "#" + r.numeroRapport + "\n" : ""}${r.date} · ${r.heure}\n\n${r.produit}${r.origine ? " — " + r.origine : ""}\nFournisseur : ${r.fournisseur}${r.lotMoorea ? " · Lot " + r.lotMoorea : ""}\n\n${dl}${r.score ? "\nScore : " + r.score + "/5" : ""}${r.observations ? "\n" + r.observations : ""}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    setTimeout(() => generatePDF(r), 800);
  };

  // Stats
  const statsParFournisseur = () => {
    const map: Record<string, { total: number; valides: number; litiges: number; score: number[] }> = {};
    arrivages.forEach(a => {
      if (!map[a.fournisseur]) map[a.fournisseur] = { total: 0, valides: 0, litiges: 0, score: [] };
      map[a.fournisseur].total++;
      if (a.statut === "validé") map[a.fournisseur].valides++;
      if (a.statut === "refusé" || a.statut === "sous réserve") map[a.fournisseur].litiges++;
      if (a.rapport?.qualite) map[a.fournisseur].score.push(a.rapport.qualite);
    });
    return Object.entries(map).map(([f, s]) => ({ fournisseur: f, ...s, scoreMoyen: s.score.length ? (s.score.reduce((a, b) => a + b, 0) / s.score.length).toFixed(1) : null, tauxLitige: s.total ? Math.round(s.litiges / s.total * 100) : 0 })).sort((a, b) => b.litiges - a.litiges);
  };

  // ── AUTH SCREENS ──────────────────────────────────────────────────────────
  if (user === undefined) return <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "#c8a84b" }}>Chargement…</p></div>;

  if (!user || !user.email?.endsWith("@moorea.fr")) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 24 }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontWeight: 800, fontSize: 28, color: C.gold, letterSpacing: "2px", margin: "0 0 4px" }}>🍃 MOOREA</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>Arrivages · Agrément · Qualité · Litiges</p>
      </div>
      <button onClick={login} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 28px", borderRadius: 14, border: "none", background: "#fff", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "#1a1a1a", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" /><path fill="#34A853" d="M6.3 14.7l7 5.1C15 16.1 19.1 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z" /><path fill="#FBBC05" d="M24 46c5.9 0 10.9-2 14.6-5.4l-6.7-5.5C29.8 36.8 27 38 24 38c-6 0-11.1-4-12.9-9.6l-7 5.4C7.8 41.4 15.4 46 24 46z" /><path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-1 2.8-2.9 5.1-5.3 6.6l6.7 5.5C41 37.1 45 31.1 45 24c0-1.3-.2-2.7-.5-4z" /></svg>
        Se connecter avec Google
      </button>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", margin: 0 }}>Accès réservé aux comptes @moorea.fr</p>
    </div>
  );

  // ── RAPPORT FORM (plein écran) ────────────────────────────────────────────
  if (rapportArrivage) return <RapportForm arrivage={rapportArrivage} user={user} rapports={rapports} onSave={handleSaveRapport} onCancel={() => setRapportArrivage(null)} />;

  const filteredEA = filtered(enAttente);
  const stats = statsParFournisseur();

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {/* Toast */}
      {toast && <div style={{ position: "fixed" as const, top: 16, right: 16, zIndex: 1100, background: toast.type === "err" ? C.red : C.greenLight, color: toast.type === "err" ? C.redText : C.greenDark, border: `1px solid ${toast.type === "err" ? C.redBorder : C.greenBorder}`, borderRadius: 12, padding: "11px 20px", fontWeight: 600, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>{toast.msg}</div>}

      {/* Header */}
      <div style={{ background: C.header, padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid ${C.gold}`, position: "sticky" as const, top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: C.gold, letterSpacing: "1px" }}>🍃 Moorea</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", borderLeft: "1px solid #333", paddingLeft: 10 }}>Rungis</span>
        </div>
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.06)", padding: 3, borderRadius: 10 }}>
          {[
            { id: "arrivages", label: `Arrivages${enAttente.length > 0 ? " · " + enAttente.length : ""}`, icon: "📋" },
            { id: "historique", label: "Historique", icon: "📁" },
            { id: "stats", label: "Stats", icon: "📊" },
          ].map(t => (
            <button key={t.id} onClick={() => setPage(t.id)} style={{ padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: page === t.id ? 700 : 400, background: page === t.id ? C.gold : "transparent", color: page === t.id ? "#0a0a0a" : "rgba(255,255,255,0.55)", border: "none", transition: "all 0.15s" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => signOut(auth)} style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer", padding: "6px 10px" }}>
          {user.displayName?.split(" ")[0] || user.email?.split("@")[0]} · Déco
        </button>
      </div>

      <div style={{ maxWidth: 740, margin: "0 auto", padding: "24px 16px 60px" }}>

        {/* ── ARRIVAGES ── */}
        {page === "arrivages" && <>
          {/* Stats */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <StatCard label="À traiter" value={enAttente.length} color={C.amberText} />
            <StatCard label="Validés" value={archives.filter(a => a.statut === "validé").length} color={C.greenDark} />
            <StatCard label="Litiges" value={arrivages.filter(a => a.statut === "refusé" || a.statut === "sous réserve").length} color={C.redText} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" as const }}>
            <button onClick={() => setPage("saisie")} style={{ padding: "10px 16px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1.5px solid ${C.goldBorder}`, background: C.gold, color: "#fff" }}>➕ Nouvel arrivage</button>
            <label style={{ padding: "10px 16px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1.5px solid ${C.goldBorder}`, background: C.white, color: C.text, display: "inline-block" }}>
              📊 Import (.xlsx / .pdf)
              <input type="file" accept=".xlsx,.xls,.pdf" onChange={handleExcel} style={{ display: "none" }} />
            </label>
            <button onClick={() => setHorsListeMode(true)} style={{ padding: "10px 16px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, border: "1.5px solid #ffcc80", background: "#fff3e0", color: "#e65100" }}>⚠️ Litige hors liste</button>
          </div>

          {/* Preview import */}
          {preview && (
            <div style={{ background: C.white, border: `1.5px solid ${C.goldBorder}`, borderRadius: 16, padding: "16px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ margin: 0, fontWeight: 700, color: C.greenDark }}>✅ {preview.length} arrivages détectés</p>
                <button onClick={() => setPreview(null)} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, cursor: "pointer", background: "transparent", border: `1px solid ${C.redBorder}`, color: C.redText }}>Annuler</button>
              </div>
              {preview.slice(0, 5).map((a, i) => <div key={i} style={{ background: "#fafffe", borderRadius: 8, padding: "6px 12px", marginBottom: 4, fontSize: 13 }}><strong>{a.produit}</strong> · {a.fournisseur} · {a.quantite} {a.unite}</div>)}
              {preview.length > 5 && <p style={{ fontSize: 12, color: C.textMuted }}>...et {preview.length - 5} autres</p>}
              <button onClick={confirmImport} disabled={importing} style={{ width: "100%", marginTop: 10, padding: "11px", background: importing ? "#ccc" : C.green, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                {importing ? "Import..." : `Confirmer l'import de ${preview.length} arrivages →`}
              </button>
            </div>
          )}

          {/* Filtre */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} placeholder="🔍 Produit ou fournisseur..." style={{ ...inputStyle, flex: 1 }} />
            <select value={filters.statut} onChange={e => setFilters({ ...filters, statut: e.target.value })} style={{ ...inputStyle, width: 150 }}>
              <option value="tous">Tous statuts</option>
              <option value="en attente">En attente</option>
              <option value="validé">Validés</option>
              <option value="refusé">Litiges refus</option>
              <option value="sous réserve">Sous réserve</option>
            </select>
          </div>

          {/* Accordéon date/fournisseur */}
          {filteredEA.length > 0 && <>
            <p style={{ fontWeight: 700, fontSize: 12, color: C.amberText, margin: "0 0 12px", textTransform: "uppercase" as const, letterSpacing: "0.8px" }}>⏳ En attente d'agrément · {filteredEA.length}</p>
            {(() => {
              const byDate: Record<string, any[]> = {};
              filteredEA.forEach(a => { const d = a.date || "—"; if (!byDate[d]) byDate[d] = []; byDate[d].push(a); });
              return Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).map(([date, arr]) => (
                <DateBlock key={date} date={date} arrivages={arr} onValidate={(a: any, ctrl: any, dec: string, type: string, raison: string, pct: string) => handleAgrement(a, ctrl, dec, type, raison, pct)} onDelete={deleteArrivage} onOuvreRapport={(a: any) => setRapportArrivage(a)} />
              ));
            })()}
          </>}

          {filteredEA.length === 0 && enAttente.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem", background: C.greenLight, border: `1px solid ${C.greenBorder}`, borderRadius: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
              <p style={{ margin: 0, fontWeight: 700, color: C.greenDark }}>Tout est traité !</p>
            </div>
          )}

          {/* Archivés */}
          {filtered(archives).length > 0 && <>
            <p style={{ fontWeight: 700, fontSize: 12, color: C.textMuted, margin: "24px 0 10px", textTransform: "uppercase" as const, letterSpacing: "0.8px" }}>📁 Archivés · {filtered(archives).length}</p>
            {filtered(archives).slice(0, 15).map(a => (
              <div key={a.id} style={{ background: C.white, borderRadius: 12, padding: "10px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.04)", borderLeft: `3px solid ${a.statut === "validé" ? C.green : a.statut === "refusé" ? C.redText : "#d97706"}` }}>
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: C.text }}>{a.produit} · {a.fournisseur}{a.hors_liste ? <span style={{ marginLeft: 8, fontSize: 10, background: "#fff3e0", color: "#e65100", padding: "1px 6px", borderRadius: 10, fontWeight: 600 }}>Hors liste</span> : null}</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.textMuted }}>{a.date}{a.rapport?.qualite ? ` · Note ${a.rapport.qualite}/5` : ""}{a.litige?.raison ? ` · ${a.litige.raison}` : ""}</p>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Badge status={a.statut} />
                  <button onClick={() => deleteArrivage(a.id)} style={{ background: "transparent", border: `1px solid ${C.redBorder}`, color: C.redText, borderRadius: 8, padding: "3px 7px", cursor: "pointer", fontSize: 11 }}>🗑</button>
                </div>
              </div>
            ))}
          </>}
        </>}

        {/* ── SAISIE ── */}
        {page === "saisie" && (
          <div style={{ background: C.white, borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.07)", overflow: "hidden" }}>
            <div style={{ background: C.goldLight, borderBottom: `1px solid ${C.goldBorder}`, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: C.text }}>➕ Nouvel arrivage</p>
              <button onClick={() => setPage("arrivages")} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, cursor: "pointer", background: "transparent", border: `1px solid ${C.goldBorder}`, color: C.textMuted }}>← Retour</button>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <F label="Fournisseur" required><input value={form.fournisseur} onChange={e => setForm({ ...form, fournisseur: e.target.value })} placeholder="Ex : PICVERT" style={inputStyle} /></F>
                <F label="Produit" required><input value={form.produit} onChange={e => setForm({ ...form, produit: e.target.value })} placeholder="Ex : Tomate grappe" style={inputStyle} /></F>
                <F label="Variété"><input value={form.variete} onChange={e => setForm({ ...form, variete: e.target.value })} style={inputStyle} /></F>
                <F label="Origine"><input value={form.origine} onChange={e => setForm({ ...form, origine: e.target.value })} style={inputStyle} /></F>
                <F label="N° Lot interne"><input value={form.lot_interne} onChange={e => setForm({ ...form, lot_interne: e.target.value })} style={inputStyle} /></F>
                <F label="N° Lot fournisseur"><input value={form.lot_fournisseur} onChange={e => setForm({ ...form, lot_fournisseur: e.target.value })} style={inputStyle} /></F>
                <F label="Quantité" required>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="number" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                    <select value={form.unite} onChange={e => setForm({ ...form, unite: e.target.value })} style={{ ...inputStyle, width: 90 }}><option>colis</option><option>kg</option></select>
                  </div>
                </F>
                <F label="Poids colis (kg)"><input type="number" step="0.1" value={form.poids_colis} onChange={e => setForm({ ...form, poids_colis: e.target.value })} style={inputStyle} /></F>
              </div>
              <button onClick={submitArrivage} style={{ width: "100%", padding: "13px", background: C.gold, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 15 }}>✓ Enregistrer</button>
            </div>
          </div>
        )}

        {/* ── HISTORIQUE ── */}
        {page === "historique" && <>
          <p style={{ fontWeight: 700, fontSize: 12, color: C.textMuted, margin: "0 0 12px", textTransform: "uppercase" as const, letterSpacing: "0.8px" }}>📁 Historique · {arrivages.length} arrivages</p>
          <input value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder="🔍 Rechercher..." style={{ ...inputStyle, marginBottom: 14 }} />
          {arrivages.filter(a => !histSearch || `${a.produit} ${a.fournisseur}`.toLowerCase().includes(histSearch.toLowerCase())).map(a => {
            const rapport = rapports.find(r => r.arrivage_id === a.id);
            return (
              <div key={a.id} style={{ background: C.white, borderRadius: 16, boxShadow: "0 2px 16px rgba(0,0,0,0.05)", marginBottom: 12, overflow: "hidden", borderLeft: `4px solid ${a.statut === "validé" ? C.green : a.statut === "refusé" ? C.redText : a.statut === "sous réserve" ? "#d97706" : C.amberText}` }}>
                <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ margin: "0 0 5px", fontWeight: 700, fontSize: 14, color: C.text }}>{a.produit}{a.variete ? ` · ${a.variete}` : ""}{a.hors_liste ? <span style={{ marginLeft: 8, fontSize: 10, background: "#fff3e0", color: "#e65100", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Hors liste</span> : null}</p>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
                      <Pill>🏭 {a.fournisseur}</Pill>
                      <Pill>📦 {a.quantite} {a.unite}</Pill>
                      {a.lot_interne && <Pill>🔖 {a.lot_interne}</Pill>}
                      {a.origine && <Pill>🌍 {a.origine}</Pill>}
                      <span style={{ fontSize: 11, color: C.textMuted, alignSelf: "center" }}>📅 {a.date}</span>
                    </div>
                  </div>
                  <Badge status={a.statut} />
                </div>

                {/* Rapport rattaché */}
                {rapport && (
                  <div style={{ borderTop: `1px solid ${C.goldBorder}`, padding: "10px 18px", background: C.goldLight, display: "flex", gap: 12, flexWrap: "wrap" as const, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>📋 {rapport.numeroRapport}</span>
                    {rapport.notes?.qualite > 0 && <span style={{ fontSize: 12, color: NOTE_COLORS[rapport.notes.qualite], fontWeight: 700, background: NOTE_BG[rapport.notes.qualite], padding: "2px 8px", borderRadius: 20 }}>Note {rapport.notes.qualite}/5 — {NOTE_LABELS[rapport.notes.qualite]}</span>}
                    {rapport.temperature && <span style={{ fontSize: 12, color: "#1d4ed8" }}>🌡 {rapport.temperature}°C</span>}
                    {rapport.observations && <span style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" as const }}>"{rapport.observations}"</span>}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button onClick={() => generatePDF(rapport)} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.goldBorder}`, background: C.goldLight, color: "#8a6f2e", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>📤 PDF</button>
                      <button onClick={() => sendWhatsApp(rapport)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#25d366", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>WhatsApp</button>
                    </div>
                  </div>
                )}

                {/* Litige rattaché */}
                {a.litige && (
                  <div style={{ borderTop: `1px solid ${a.litige.type === "refusé" ? C.redBorder : "#fcd34d"}`, padding: "10px 18px", background: a.litige.type === "refusé" ? C.red : C.amber, display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: a.litige.type === "refusé" ? C.redText : C.amberText }}>{a.litige.type === "refusé" ? "❌ Litige refus" : "⚠️ Litige réserve"}</span>
                    <span style={{ fontSize: 12, color: a.litige.type === "refusé" ? C.redText : C.amberText }}>{a.litige.raison}</span>
                    {a.litige.pct && <span style={{ fontSize: 11, color: C.textMuted }}>{a.litige.pct}% concerné</span>}
                    <span style={{ marginLeft: "auto", fontSize: 11, background: a.litige.statut === "ouvert" ? C.red : "#f0fdf4", color: a.litige.statut === "ouvert" ? C.redText : C.greenDark, padding: "2px 8px", borderRadius: 20, fontWeight: 600, border: `1px solid ${a.litige.statut === "ouvert" ? C.redBorder : C.greenBorder}` }}>
                      {a.litige.statut === "ouvert" ? "● Ouvert" : "✓ Clôturé"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </>}

        {/* ── STATS ── */}
        {page === "stats" && <>
          <p style={{ fontWeight: 700, fontSize: 12, color: C.textMuted, margin: "0 0 16px", textTransform: "uppercase" as const, letterSpacing: "0.8px" }}>📊 Stats fournisseurs</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
            <StatCard label="Total arrivages" value={arrivages.length} color={C.gold} />
            <StatCard label="Taux conformité" value={archives.length ? `${Math.round(archives.filter(a => a.statut === "validé").length / Math.max(archives.length, 1) * 100)}%` : "—"} color={C.greenDark} />
            <StatCard label="Litiges ouverts" value={arrivages.filter(a => a.litige?.statut === "ouvert").length} color={C.redText} />
          </div>
          {stats.map(s => (
            <div key={s.fournisseur} style={{ background: C.white, borderRadius: 14, padding: "14px 18px", marginBottom: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.05)", borderLeft: `4px solid ${s.litiges > 0 ? C.redText : C.green}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: C.text }}>{s.fournisseur}</p>
                <div style={{ display: "flex", gap: 6 }}>
                  {s.scoreMoyen && <span style={{ fontSize: 12, fontWeight: 700, color: NOTE_COLORS[Math.round(parseFloat(s.scoreMoyen))], background: NOTE_BG[Math.round(parseFloat(s.scoreMoyen))], padding: "2px 8px", borderRadius: 20 }}>⭐ {s.scoreMoyen}/5</span>}
                  {s.tauxLitige > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: C.redText, background: C.red, padding: "2px 8px", borderRadius: 20, border: `1px solid ${C.redBorder}` }}>{s.tauxLitige}% litiges</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <span style={{ fontSize: 12, color: C.textMuted }}>{s.total} arrivages</span>
                <span style={{ fontSize: 12, color: C.greenDark }}>✓ {s.valides} validés</span>
                {s.litiges > 0 && <span style={{ fontSize: 12, color: C.redText }}>⚠ {s.litiges} litiges</span>}
              </div>
              <div style={{ marginTop: 8, height: 5, background: "#f3f4f6", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ height: "100%", background: s.tauxLitige > 30 ? C.redText : s.tauxLitige > 10 ? "#d97706" : C.green, width: `${100 - s.tauxLitige}%`, borderRadius: 10, transition: "width 0.5s" }} />
              </div>
            </div>
          ))}

          {/* Stats rapports qualité */}
          {rapports.length > 0 && <>
            <p style={{ fontWeight: 700, fontSize: 12, color: C.textMuted, margin: "24px 0 12px", textTransform: "uppercase" as const, letterSpacing: "0.8px" }}>📋 Rapports qualité · {rapports.length} fiches</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              <StatCard label="Conformes" value={rapports.filter(r => r.decision === "stock").length} color={C.green} />
              <StatCard label="Réserves" value={rapports.filter(r => r.decision === "reserve").length} color={C.amberText} />
              <StatCard label="Refus" value={rapports.filter(r => r.decision === "refus").length} color={C.redText} />
            </div>
          </>}
        </>}

        {/* ── MODAL HORS LISTE ── */}
        {horsListeMode && (
          <div style={{ position: "fixed" as const, inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: C.white, borderRadius: 20, width: "100%", maxWidth: 480, boxShadow: "0 8px 40px rgba(0,0,0,0.18)", overflow: "hidden", maxHeight: "90vh", overflowY: "auto" as const }}>
              <div style={{ background: "#fff3e0", borderBottom: "1px solid #ffcc80", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#e65100" }}>⚠️ Litige hors liste</p>
                <button onClick={() => setHorsListeMode(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.textMuted }}>×</button>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
                  <F label="Produit" required><input value={horsListe.produit} onChange={e => setHorsListe({ ...horsListe, produit: e.target.value })} style={inputStyle} /></F>
                  <F label="Fournisseur" required><input value={horsListe.fournisseur} onChange={e => setHorsListe({ ...horsListe, fournisseur: e.target.value })} style={inputStyle} /></F>
                  <F label="N° Lot interne"><input value={horsListe.lot_interne} onChange={e => setHorsListe({ ...horsListe, lot_interne: e.target.value })} style={inputStyle} /></F>
                  <F label="N° Lot fournisseur"><input value={horsListe.lot_fournisseur} onChange={e => setHorsListe({ ...horsListe, lot_fournisseur: e.target.value })} style={inputStyle} /></F>
                </div>
                <F label="Type">
                  <div style={{ display: "flex", gap: 8 }}>
                    {["refusé", "sous réserve"].map(t => (
                      <button key={t} onClick={() => setHorsListe({ ...horsListe, type: t })} style={{ flex: 1, padding: "9px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 12, border: `2px solid ${horsListe.type === t ? (t === "refusé" ? C.redText : "#d97706") : "#e5e7eb"}`, background: horsListe.type === t ? (t === "refusé" ? C.red : C.amber) : "#fff", color: horsListe.type === t ? (t === "refusé" ? C.redText : C.amberText) : C.textMuted }}>
                        {t === "refusé" ? "❌ Refus" : "⚠️ Réserve"}
                      </button>
                    ))}
                  </div>
                </F>
                <F label="Raison" required><input value={horsListe.raison} onChange={e => setHorsListe({ ...horsListe, raison: e.target.value })} placeholder="Ex : Moisissures..." style={inputStyle} /></F>
                <button onClick={submitHorsListe} style={{ width: "100%", padding: "13px", background: horsListe.type === "refusé" ? C.redText : "#d97706", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>📋 Enregistrer →</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
