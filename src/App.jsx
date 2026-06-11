import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, update, remove } from "firebase/database";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

// ── FIREBASE (moorea-qualite) ─────────────────────────────────────────────────
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
const db  = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// ── COLORS & STYLES ───────────────────────────────────────────────────────────
const C = {
  bg:"#f5f3ee", header:"#0a0a0a", white:"#ffffff",
  green:"#27ae60", greenDark:"#1a6b3a", greenLight:"#eafaf1",
  greenBorder:"#d4edda", text:"#1a2e1a", textMuted:"#6b7280",
  gold:"#c8a84b", goldLight:"#faf8f3", goldBorder:"#e8e0d0",
  red:"#fef2f2", redText:"#dc2626", redBorder:"#fca5a5",
  amber:"#fffbeb", amberText:"#d97706", amberBorder:"#fcd34d",
  blue:"#eff6ff", blueText:"#2563eb", blueBorder:"#bfdbfe",
  purple:"#f5f3ff", purpleText:"#7c3aed", purpleBorder:"#ddd6fe",
};

const NOTE_LABELS = {1:"Insuffisant",2:"Passable",3:"Correct",4:"Bon",5:"Excellent"};
const NOTE_COLORS = {1:"#dc2626",2:"#f97316",3:"#eab308",4:"#22c55e",5:"#15803d"};
const NOTE_BG     = {1:"#fef2f2",2:"#fff7ed",3:"#fefce8",4:"#f0fdf4",5:"#dcfce7"};

const INIT_FORM = {
  fournisseur:"", produit:"", variete:"", origine:"",
  quantite:"", unite:"colis", transporteur:"",
  temp_annoncee:"", lot_interne:"", lot_fournisseur:"",
  poids_net:"", poids_colis:""
};

const INIT_CTRL = {
  qualite:0, temperature:"", poids_mesure:"",
  ggn:false, num_lot:false, origine_ok:false,
  lot_fournisseur_litige:"", observations:""
};

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const map = {
    "en attente": { bg:C.amber,      color:C.amberText, border:C.amberBorder, label:"En attente" },
    "validé":     { bg:C.greenLight, color:C.greenDark, border:C.greenBorder, label:"Validé ✓" },
    "refusé":     { bg:C.red,        color:C.redText,   border:C.redBorder,   label:"Refus litige" },
    "sous réserve":{ bg:"#fffbeb",   color:"#92400e",   border:"#fcd34d",     label:"Sous réserve" },
  };
  const s = map[status] || map["en attente"];
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,background:s.bg,color:s.color,
      border:`1px solid ${s.border}`,fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20}}>
      {s.label}
    </span>
  );
}

function Pill({ children, color }) {
  return (
    <span style={{background:color?color+"18":"#f4f7f5",border:`1px solid ${color?color+"33":C.greenBorder}`,
      color:color||C.greenDark,fontSize:11,fontWeight:500,padding:"2px 8px",borderRadius:20,
      fontFamily:"system-ui,sans-serif"}}>
      {children}
    </span>
  );
}

function NoteBtn({ n, selected, onChange }) {
  const active = selected === n;
  return (
    <button onClick={() => onChange(n)}
      style={{width:40,height:40,borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:active?700:400,
        border:`1.5px solid ${active?NOTE_COLORS[n]:"#e5e7eb"}`,
        background:active?NOTE_BG[n]:"#fff",
        color:active?NOTE_COLORS[n]:"#9ca3af",transition:"all 0.12s"}}>
      {n}
    </button>
  );
}

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{background:C.white,borderRadius:14,padding:"14px 16px",flex:1,
      boxShadow:"0 2px 12px rgba(0,0,0,0.05)",borderTop:`3px solid ${color||C.greenBorder}`}}>
      <p style={{margin:"0 0 2px",fontSize:11,color:C.textMuted,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</p>
      <p style={{margin:0,fontSize:26,fontWeight:700,color:color||C.greenDark,letterSpacing:"-1px"}}>{value}</p>
      {sub&&<p style={{margin:"2px 0 0",fontSize:11,color:C.textMuted}}>{sub}</p>}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{fontSize:11,fontWeight:600,color:C.textMuted,display:"block",marginBottom:5,
        textTransform:"uppercase",letterSpacing:"0.5px"}}>
        {label}{required&&<span style={{color:C.redText,marginLeft:2}}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  border:`1.5px solid ${C.goldBorder}`,borderRadius:10,padding:"10px 12px",fontSize:14,
  color:C.text,background:C.white,width:"100%",boxSizing:"border-box",
  outline:"none",fontFamily:"system-ui,sans-serif"
};

// ── AGRÉMENT INLINE PANEL ─────────────────────────────────────────────────────
function AgrémentPanel({ arrivage, onSubmit, onCancel }) {
  const [ctrl, setCtrl] = useState(INIT_CTRL);
  const [decision, setDecision] = useState("");
  const [ncType, setNcType] = useState("");
  const [raison, setRaison] = useState("");
  const [pct, setPct] = useState("");

  const canSubmit = decision === "conforme"
    ? ctrl.qualite > 0
    : ctrl.qualite > 0 && ncType && raison;

  return (
    <div style={{background:"#fafffe",borderTop:`1px solid ${C.greenBorder}`,padding:"16px 20px"}}>

      {/* Note qualité */}
      <div style={{marginBottom:14}}>
        <p style={{margin:"0 0 8px",fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.5px"}}>👁 Note qualité visuelle</p>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {[1,2,3,4,5].map(n=><NoteBtn key={n} n={n} selected={ctrl.qualite} onChange={v=>setCtrl({...ctrl,qualite:v})}/>)}
          {ctrl.qualite>0&&<span style={{fontSize:12,fontWeight:600,color:NOTE_COLORS[ctrl.qualite],marginLeft:4}}>{NOTE_LABELS[ctrl.qualite]}</span>}
        </div>
      </div>

      {/* Température + Poids */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px",marginBottom:14}}>
        <Field label="🌡 Température (°C)">
          <input type="number" step="0.1" value={ctrl.temperature}
            onChange={e=>setCtrl({...ctrl,temperature:e.target.value})}
            placeholder="Ex : 4" style={inputStyle}/>
        </Field>
        <Field label="⚖️ Poids mesuré (kg)">
          <input type="number" step="0.1" value={ctrl.poids_mesure}
            onChange={e=>setCtrl({...ctrl,poids_mesure:e.target.value})}
            placeholder="Ex : 5.2" style={inputStyle}/>
        </Field>
      </div>

      {/* Décision */}
      <div style={{marginBottom:14}}>
        <p style={{margin:"0 0 8px",fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.5px"}}>📋 Décision</p>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{setDecision("conforme");setNcType("");}}
            style={{flex:1,padding:"11px",borderRadius:12,cursor:"pointer",fontWeight:700,fontSize:13,
              border:`2px solid ${decision==="conforme"?C.green:"#e5e7eb"}`,
              background:decision==="conforme"?C.greenLight:"#fff",
              color:decision==="conforme"?C.greenDark:"#9ca3af"}}>
            ✅ Conforme
          </button>
          <button onClick={()=>setDecision("non_conforme")}
            style={{flex:1,padding:"11px",borderRadius:12,cursor:"pointer",fontWeight:700,fontSize:13,
              border:`2px solid ${decision==="non_conforme"?C.redText:"#e5e7eb"}`,
              background:decision==="non_conforme"?C.red:"#fff",
              color:decision==="non_conforme"?C.redText:"#9ca3af"}}>
            ❌ Non conforme
          </button>
        </div>
      </div>

      {/* Non conforme → détails */}
      {decision==="non_conforme"&&(
        <div style={{background:C.red,border:`1px solid ${C.redBorder}`,borderRadius:12,
          padding:"14px 16px",marginBottom:14}}>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <button onClick={()=>setNcType("refusé")}
              style={{flex:1,padding:"9px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:12,
                border:`2px solid ${ncType==="refusé"?C.redText:"#fca5a5"}`,
                background:ncType==="refusé"?"#fca5a5":"#fff",color:C.redText}}>
              ❌ Refus total
            </button>
            <button onClick={()=>setNcType("sous réserve")}
              style={{flex:1,padding:"9px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:12,
                border:`2px solid ${ncType==="sous réserve"?C.amberText:"#fcd34d"}`,
                background:ncType==="sous réserve"?"#fcd34d":"#fff",color:C.amberText}}>
              ⚠️ Sous réserve
            </button>
          </div>
          <Field label="Raison *">
            <input value={raison} onChange={e=>setRaison(e.target.value)}
              placeholder="Ex : Moisissures, casse, température hors norme..."
              style={inputStyle}/>
          </Field>
          <Field label="% concerné">
            <input type="number" min="0" max="100" value={pct}
              onChange={e=>setPct(e.target.value)}
              placeholder="Ex : 30" style={{...inputStyle,width:100}}/>
          </Field>
          <Field label="N° lot fournisseur">
            <input value={ctrl.lot_fournisseur_litige}
              onChange={e=>setCtrl({...ctrl,lot_fournisseur_litige:e.target.value})}
              placeholder="Ex : 26032146" style={inputStyle}/>
          </Field>
          <div style={{background:"#fff3e0",border:"1px solid #ffcc80",borderRadius:8,
            padding:"7px 10px",fontSize:12,color:"#e65100",fontWeight:600}}>
            ⚡ Un litige sera automatiquement rattaché à cet arrivage
          </div>
        </div>
      )}

      <Field label="💬 Observations">
        <input value={ctrl.observations} onChange={e=>setCtrl({...ctrl,observations:e.target.value})}
          placeholder="Remarques..." style={inputStyle}/>
      </Field>

      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={onCancel}
          style={{padding:"10px 18px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600,
            border:`1.5px solid ${C.goldBorder}`,background:C.white,color:C.textMuted}}>
          Annuler
        </button>
        <button onClick={()=>onSubmit(ctrl,decision,ncType,raison,pct)}
          disabled={!canSubmit}
          style={{flex:1,padding:"11px",borderRadius:12,cursor:canSubmit?"pointer":"not-allowed",
            fontWeight:700,fontSize:14,border:"none",
            background:canSubmit?C.gold:"#e5e7eb",
            color:canSubmit?"#fff":"#9ca3af",transition:"all 0.12s"}}>
          {decision==="conforme"?"✅ Valider et archiver →":"📋 Créer rapport + litige →"}
        </button>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(undefined);
  const [page, setPage] = useState("arrivages");
  const [arrivages, setArrivages] = useState([]);
  const [form, setForm] = useState(INIT_FORM);
  const [toast, setToast] = useState(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [filters, setFilters] = useState({q:"",fournisseur:"",statut:"tous"});
  const [horsListeMode, setHorsListeMode] = useState(false);
  const [horsListe, setHorsListe] = useState({
    produit:"",fournisseur:"",lot_interne:"",lot_fournisseur:"",
    origine:"",quantite:"",unite:"colis",type:"refusé",raison:"",pct:""
  });

  // Auth
  useEffect(()=>{
    return onAuthStateChanged(auth, u => setUser(u));
  },[]);

  // Arrivages realtime
  useEffect(()=>{
    return onValue(ref(db,"arrivages"),(snap)=>{
      const data = snap.val();
      if(data){
        const list = Object.entries(data).map(([id,v])=>({...v,id}));
        list.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
        setArrivages(list);
      } else setArrivages([]);
    });
  },[]);

  const showToast = (msg,type="ok")=>{
    setToast({msg,type});
    setTimeout(()=>setToast(null),3500);
  };

  const login = async()=>{
    try {
      const r = await signInWithPopup(auth,googleProvider);
      if(!r.user.email?.endsWith("@moorea.fr")){
        await signOut(auth);
        alert("Accès réservé aux comptes @moorea.fr");
      }
    } catch(e){ console.error(e); }
  };

  // ── DÉRIVÉS ───────────────────────────────────────────────────────────────
  const enAttente  = arrivages.filter(a=>a.statut==="en attente");
  const archives   = arrivages.filter(a=>a.statut!=="en attente");
  const allLitiges = arrivages.filter(a=>a.statut==="refusé"||a.statut==="sous réserve");

  const filtered = (list) => list.filter(a=>{
    if(filters.q && !`${a.produit} ${a.fournisseur}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
    if(filters.fournisseur && !a.fournisseur?.toLowerCase().includes(filters.fournisseur.toLowerCase())) return false;
    if(filters.statut!=="tous" && a.statut!==filters.statut) return false;
    return true;
  });

  // ── AGRÉMENT ──────────────────────────────────────────────────────────────
  const handleAgrement = async(arrivage, ctrl, decision, ncType, raison, pct)=>{
    const now = new Date();
    const heure = now.toTimeString().slice(0,5);
    const statut = decision==="conforme" ? "validé" : ncType;

    const rapport = {
      qualite: ctrl.qualite,
      temperature: ctrl.temperature,
      poids_mesure: ctrl.poids_mesure,
      lot_fournisseur_litige: ctrl.lot_fournisseur_litige,
      observations: ctrl.observations,
      heure_agreage: heure,
      date_rapport: now.toLocaleDateString("fr-FR"),
      agreeur: user?.displayName || user?.email || "—",
    };

    let litige = null;
    if(decision==="non_conforme"){
      litige = {
        type: ncType,
        raison,
        pct: pct||"",
        lot_fournisseur: ctrl.lot_fournisseur_litige || arrivage.lot_fournisseur || "",
        date: now.toLocaleDateString("fr-FR"),
        heure,
        statut: "ouvert",
        createdAt: Date.now(),
      };
    }

    await update(ref(db,`arrivages/${arrivage.id}`),{
      statut,
      archived: true,
      rapport,
      ...(litige ? {litige} : {}),
      validatedAt: Date.now(),
    });

    setExpandedId(null);
    showToast(decision==="conforme"?"✅ Validé et archivé":"📋 Rapport créé + litige rattaché");
  };

  // ── SAISIE ARRIVAGE ───────────────────────────────────────────────────────
  const submitArrivage = async()=>{
    if(!form.fournisseur||!form.produit||!form.quantite){
      showToast("Champs obligatoires manquants","err"); return;
    }
    const now = new Date();
    await push(ref(db,"arrivages"),{
      ...form, statut:"en attente",
      date: now.toLocaleDateString("fr-FR"),
      timestamp: Date.now(),
    });
    setForm(INIT_FORM);
    setPage("arrivages");
    showToast("Arrivage enregistré ✓");
  };

  const deleteArrivage = async(id)=>{
    if(!window.confirm("Supprimer ?")) return;
    await remove(ref(db,`arrivages/${id}`));
    if(expandedId===id) setExpandedId(null);
    showToast("Supprimé");
  };

  // ── EXCEL IMPORT ──────────────────────────────────────────────────────────
  // ── PARSER COMMUN ────────────────────────────────────────────────────────
  const parseGeslotRows = (rows, now) => {
    const arr=[];
    let curLot="", curFournisseur="", curDate=now.toLocaleDateString("fr-FR");
    for(const row of rows){
      const col0=String(row[0]||"").trim();
      const col1=String(row[1]||"").trim();
      const col2=String(row[2]||"").trim();
      const col3=String(row[3]||"").trim();
      const col7=String(row[7]||"").trim();
      const col9=String(row[9]||"").trim();
      if(col0==="Lot" && col1){
        curLot=col1;
        if(col2==="Fournisseur") curFournisseur=col3.toUpperCase();
        if(col7==="Date arrivée" && col9){
          try { const d=new Date(col9); curDate=isNaN(d)?curDate:d.toLocaleDateString("fr-FR"); } catch(e){}
        }
      }
      const nbColis=parseInt(row[4]||0);
      if(/^0[0-9]$/.test(col0) && col1 && col2 && nbColis>0){
        arr.push({
          fournisseur:curFournisseur||"",
          produit:col2, lot_interne:curLot||"", lot_fournisseur:"",
          quantite:nbColis, unite:"colis",
          poids_net:String(row[10]||""), origine:"", variete:"",
          date:curDate, timestamp:Date.now(),
        });
      }
    }
    return arr;
  };

  // ── PARSER PDF GESLOT ────────────────────────────────────────────────────
  const parseGeslotPDF = (text) => {
    const arr=[];
    const now=new Date();
    let curLot="", curFournisseur="", curDate=now.toLocaleDateString("fr-FR");
    const lines=text.split("\n").map(l=>l.trim()).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      // Lot line: "Lot 26064412 Fournisseur 1473 GREENYARD FRESH Date arrivée 11/06/2026"
      const lotMatch=line.match(/Lot\s+(\d+)\s+Fournisseur\s+\d+\s+(.+?)\s+Date arriv[eé]e\s+(\d{2}\/\d{2}\/\d{4})/i);
      if(lotMatch){
        curLot=lotMatch[1];
        curFournisseur=lotMatch[2].trim().toUpperCase();
        curDate=lotMatch[3];
        continue;
      }
      // Produit line: "01 CODE LIBELLE NB_COLIS ..."
      // Format: SL(01-99) CODE LIBELLE NB_COLIS NB_PIECES? POIDS...
      const prodMatch=line.match(/^(\d{2})\s+(\S+)\s+(.+?)\s+(\d+)\s+/);
      if(prodMatch){
        const sl=prodMatch[1];
        const nbColis=parseInt(prodMatch[4]);
        if(parseInt(sl)>=1 && parseInt(sl)<=99 && nbColis>0){
          // Libellé = tout ce qui est entre code et nombre de colis
          const libelle=prodMatch[3].trim();
          if(libelle.length>3){
            arr.push({
              fournisseur:curFournisseur||"",
              produit:libelle, lot_interne:curLot||"", lot_fournisseur:"",
              quantite:nbColis, unite:"colis",
              poids_net:"", origine:"", variete:"",
              date:curDate, timestamp:Date.now(),
            });
          }
        }
      }
    }
    return arr;
  };

  const handleExcel = (e)=>{
    const file = e.target.files[0]; if(!file) return;
    setImporting(true);
    const now = new Date();

    // ── PDF ──
    if(file.name.endsWith(".pdf")){
      const loadPDFJS = ()=>new Promise((res,rej)=>{
        if(window.pdfjsLib){res(window.pdfjsLib);return;}
        const s=document.createElement("script");
        s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        s.onload=()=>{
          window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          res(window.pdfjsLib);
        };
        s.onerror=rej;
        document.head.appendChild(s);
      });
      const reader=new FileReader();
      reader.onload=async(evt)=>{
        try{
          const pdfjsLib=await loadPDFJS();
          const pdf=await pdfjsLib.getDocument({data:evt.target.result}).promise;
          let fullText="";
          for(let p=1;p<=pdf.numPages;p++){
            const page=await pdf.getPage(p);
            const tc=await page.getTextContent();
            fullText+=tc.items.map(i=>i.str).join(" ")+"\n";
          }
          const arr=parseGeslotPDF(fullText);
          if(arr.length===0){showToast("Aucun arrivage détecté dans le PDF","err");setImporting(false);return;}
          setPreview(arr); setImporting(false);
        } catch(err){showToast("Erreur lecture PDF","err");setImporting(false);}
      };
      reader.readAsArrayBuffer(file);
      e.target.value="";
      return;
    }

    // ── XLSX ──
    const reader = new FileReader();
    reader.onload = (evt)=>{
      const loadXLSX = ()=>new Promise((res,rej)=>{
        if(window.XLSX){res(window.XLSX);return;}
        const s=document.createElement("script");
        s.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        s.onload=()=>res(window.XLSX); s.onerror=rej;
        document.head.appendChild(s);
      });
      loadXLSX().then(XLSX=>{
        const wb=XLSX.read(evt.target.result,{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        const arr=parseGeslotRows(rows,now);
        if(arr.length===0){showToast("Aucun arrivage détecté","err");setImporting(false);return;}
        setPreview(arr); setImporting(false);
      }).catch(()=>{showToast("Erreur lecture Excel","err");setImporting(false);});
    };
    reader.readAsArrayBuffer(file);
    e.target.value="";
  };

  const confirmImport = async()=>{
    if(!preview) return;
    setImporting(true);
    for(const a of preview){
      await push(ref(db,"arrivages"),{...a,statut:"en attente",timestamp:Date.now()});
    }
    setPreview(null); setImporting(false);
    showToast(`${preview.length} arrivages importés ✓`);
    setPage("arrivages");
  };

  // ── HORS LISTE ────────────────────────────────────────────────────────────
  const submitHorsListe = async()=>{
    if(!horsListe.produit||!horsListe.fournisseur||!horsListe.raison){
      showToast("Produit, fournisseur et raison requis","err"); return;
    }
    const now = new Date();
    await push(ref(db,"arrivages"),{
      ...horsListe,
      statut: horsListe.type,
      hors_liste: true,
      archived: true,
      date: now.toLocaleDateString("fr-FR"),
      timestamp: Date.now(),
      validatedAt: Date.now(),
      rapport: { date_rapport: now.toLocaleDateString("fr-FR"), heure_agreage: now.toTimeString().slice(0,5) },
      litige: {
        type: horsListe.type,
        raison: horsListe.raison,
        pct: horsListe.pct||"",
        lot_fournisseur: horsListe.lot_fournisseur||"",
        date: now.toLocaleDateString("fr-FR"),
        statut:"ouvert",
        createdAt:Date.now(),
      }
    });
    setHorsListeMode(false);
    setHorsListe({produit:"",fournisseur:"",lot_interne:"",lot_fournisseur:"",origine:"",quantite:"",unite:"colis",type:"refusé",raison:"",pct:""});
    showToast("Litige hors liste enregistré ✓");
  };

  // ── STATS ─────────────────────────────────────────────────────────────────
  const statsParFournisseur = ()=>{
    const map = {};
    arrivages.forEach(a=>{
      if(!map[a.fournisseur]) map[a.fournisseur]={total:0,valides:0,litiges:0,score:[]};
      map[a.fournisseur].total++;
      if(a.statut==="validé") map[a.fournisseur].valides++;
      if(a.statut==="refusé"||a.statut==="sous réserve") map[a.fournisseur].litiges++;
      if(a.rapport?.qualite) map[a.fournisseur].score.push(a.rapport.qualite);
    });
    return Object.entries(map)
      .map(([f,s])=>({
        fournisseur:f, ...s,
        scoreMoyen: s.score.length ? (s.score.reduce((a,b)=>a+b,0)/s.score.length).toFixed(1) : null,
        tauxLitige: s.total ? Math.round(s.litiges/s.total*100) : 0,
      }))
      .sort((a,b)=>b.litiges-a.litiges);
  };

  // ── LOGIN SCREEN ──────────────────────────────────────────────────────────
  if(user===undefined) return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:C.textMuted}}>Chargement…</p></div>;

  if(!user) return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24}}>
      <div style={{textAlign:"center",marginBottom:8}}>
        <p style={{fontWeight:800,fontSize:28,color:C.gold,letterSpacing:"2px",marginBottom:4}}>🍃 MOOREA</p>
        <p style={{fontSize:13,color:"rgba(255,255,255,0.4)"}}>Arrivages · Agrément · Litiges</p>
      </div>
      <button onClick={login} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 28px",borderRadius:14,border:"none",background:"#fff",cursor:"pointer",fontSize:15,fontWeight:600,color:"#1a1a1a",boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/><path fill="#34A853" d="M6.3 14.7l7 5.1C15 16.1 19.1 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z"/><path fill="#FBBC05" d="M24 46c5.9 0 10.9-2 14.6-5.4l-6.7-5.5C29.8 36.8 27 38 24 38c-6 0-11.1-4-12.9-9.6l-7 5.4C7.8 41.4 15.4 46 24 46z"/><path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-1 2.8-2.9 5.1-5.3 6.6l6.7 5.5C41 37.1 45 31.1 45 24c0-1.3-.2-2.7-.5-4z"/></svg>
        Se connecter avec Google
      </button>
      <p style={{fontSize:12,color:"rgba(255,255,255,0.25)"}}>Accès réservé aux comptes @moorea.fr</p>
    </div>
  );

  const Toast = ()=>toast?(
    <div style={{position:"fixed",top:16,right:16,zIndex:1100,
      background:toast.type==="err"?C.red:C.greenLight,
      color:toast.type==="err"?C.redText:C.greenDark,
      border:`1px solid ${toast.type==="err"?C.redBorder:C.greenBorder}`,
      borderRadius:12,padding:"11px 20px",fontWeight:600,fontSize:14,
      boxShadow:"0 4px 20px rgba(0,0,0,0.12)"}}>
      {toast.msg}
    </div>
  ):null;

  const filteredEA = filtered(enAttente);
  const filteredArchives = filtered(archives);
  const stats = statsParFournisseur();

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif"}}>
      <Toast/>

      {/* HEADER */}
      <div style={{background:C.header,padding:"0 24px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`3px solid ${C.gold}`,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontWeight:800,fontSize:18,color:C.gold,letterSpacing:"1px"}}>🍃 Moorea</span>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.3)",borderLeft:"1px solid #333",paddingLeft:10}}>Rungis</span>
        </div>
        <div style={{display:"flex",gap:4,background:"rgba(255,255,255,0.06)",padding:3,borderRadius:10}}>
          {[
            {id:"arrivages",label:`Arrivages${enAttente.length>0?` · ${enAttente.length}`:""}`,icon:"📋"},
            {id:"historique",label:"Historique",icon:"📁"},
            {id:"stats",label:"Stats",icon:"📊"},
          ].map(t=>(
            <button key={t.id} onClick={()=>setPage(t.id)}
              style={{padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:page===t.id?700:400,
                background:page===t.id?C.gold:"transparent",
                color:page===t.id?"#0a0a0a":"rgba(255,255,255,0.55)",
                border:"none",transition:"all 0.15s"}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <button onClick={()=>signOut(auth)}
          style={{fontSize:11,color:"rgba(255,255,255,0.35)",background:"none",border:"none",cursor:"pointer",padding:"6px 10px"}}>
          {user.displayName?.split(" ")[0]||user.email?.split("@")[0]} · Déco
        </button>
      </div>

      <div style={{maxWidth:740,margin:"0 auto",padding:"24px 16px 60px"}}>

        {/* ════ PAGE ARRIVAGES ════ */}
        {page==="arrivages"&&<>

          {/* Stats rapides */}
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            <StatCard label="À traiter" value={enAttente.length} color={C.amberText}/>
            <StatCard label="Validés" value={archives.filter(a=>a.statut==="validé").length} color={C.greenDark}/>
            <StatCard label="Litiges" value={allLitiges.length} color={C.redText}/>
          </div>

          {/* Actions */}
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            <button onClick={()=>setPage("saisie")}
              style={{padding:"10px 18px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600,
                border:`1.5px solid ${C.goldBorder}`,background:C.gold,color:"#fff"}}>
              ➕ Nouvel arrivage
            </button>
            <label style={{padding:"10px 18px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600,
              border:`1.5px solid ${C.goldBorder}`,background:C.white,color:C.text,display:"inline-block"}}>
              📊 Import Excel
              <input type="file" accept=".xlsx,.xls,.pdf" onChange={handleExcel} style={{display:"none"}}/>
            </label>
            <button onClick={()=>setHorsListeMode(true)}
              style={{padding:"10px 18px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600,
                border:`1.5px solid #ffcc80`,background:"#fff3e0",color:"#e65100"}}>
              ⚠️ Litige hors liste
            </button>
          </div>

          {/* Preview import */}
          {preview&&(
            <div style={{background:C.white,border:`1.5px solid ${C.goldBorder}`,borderRadius:16,padding:"16px 20px",marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <p style={{margin:0,fontWeight:700,color:C.greenDark}}>✅ {preview.length} arrivages détectés</p>
                <button onClick={()=>setPreview(null)} style={{fontSize:12,padding:"5px 10px",borderRadius:8,cursor:"pointer",background:"transparent",border:`1px solid ${C.redBorder}`,color:C.redText}}>Annuler</button>
              </div>
              <div style={{maxHeight:200,overflowY:"auto",marginBottom:12}}>
                {preview.slice(0,8).map((a,i)=>(
                  <div key={i} style={{background:"#fafffe",borderRadius:8,padding:"7px 12px",marginBottom:5,fontSize:13}}>
                    <strong>{a.produit}</strong> · {a.fournisseur} · {a.quantite} {a.unite}
                  </div>
                ))}
                {preview.length>8&&<p style={{fontSize:12,color:C.textMuted,margin:"4px 0 0"}}>...et {preview.length-8} autres</p>}
              </div>
              <button onClick={confirmImport} disabled={importing}
                style={{width:"100%",padding:"12px",background:importing?"#ccc":C.green,color:"#fff",
                  border:"none",borderRadius:12,fontWeight:700,cursor:importing?"default":"pointer",fontSize:14}}>
                {importing?"Import...`":`Confirmer l'import de ${preview.length} arrivages →`}
              </button>
            </div>
          )}

          {/* Filtre rapide */}
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <input value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})}
              placeholder="🔍 Produit ou fournisseur..."
              style={{...inputStyle,flex:1,minWidth:180}}/>
            <select value={filters.statut} onChange={e=>setFilters({...filters,statut:e.target.value})}
              style={{...inputStyle,width:150}}>
              <option value="tous">Tous statuts</option>
              <option value="en attente">En attente</option>
              <option value="validé">Validés</option>
              <option value="refusé">Litiges</option>
              <option value="sous réserve">Sous réserve</option>
            </select>
          </div>

          {/* Liste en attente */}
          {filteredEA.length>0&&<>
            <p style={{fontWeight:700,fontSize:12,color:C.amberText,margin:"0 0 10px",
              textTransform:"uppercase",letterSpacing:"0.8px"}}>
              ⏳ En attente d'agrément · {filteredEA.length}
            </p>
            {filteredEA.map(a=>(
              <div key={a.id} style={{background:C.white,borderRadius:16,boxShadow:"0 2px 16px rgba(0,0,0,0.06)",
                marginBottom:10,overflow:"hidden",borderLeft:`4px solid ${C.amberText}`}}>
                <div onClick={()=>setExpandedId(expandedId===a.id?null:a.id)}
                  style={{padding:"14px 18px",display:"flex",justifyContent:"space-between",
                    alignItems:"center",cursor:"pointer",userSelect:"none"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{margin:"0 0 6px",fontWeight:700,fontSize:14,color:C.text,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {a.produit}{a.variete?` · ${a.variete}`:""}
                    </p>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      <Pill>🏭 {a.fournisseur}</Pill>
                      <Pill>📦 {a.quantite} {a.unite}</Pill>
                      {a.lot_interne&&<Pill>🔖 {a.lot_interne}</Pill>}
                      {a.origine&&<Pill>🌍 {a.origine}</Pill>}
                      <span style={{fontSize:11,color:C.textMuted,alignSelf:"center"}}>📅 {a.date}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,marginLeft:10}}>
                    <Badge status="en attente"/>
                    <button onClick={e=>{e.stopPropagation();deleteArrivage(a.id);}}
                      style={{background:"transparent",border:`1px solid ${C.redBorder}`,
                        color:C.redText,borderRadius:8,padding:"3px 7px",cursor:"pointer",fontSize:12}}>🗑</button>
                    <span style={{fontSize:18,color:C.gold,fontWeight:700,
                      transform:expandedId===a.id?"rotate(90deg)":"none",
                      transition:"transform 0.2s",display:"inline-block"}}>›</span>
                  </div>
                </div>
                {expandedId===a.id&&(
                  <AgrémentPanel
                    arrivage={a}
                    onSubmit={(ctrl,dec,type,raison,pct)=>handleAgrement(a,ctrl,dec,type,raison,pct)}
                    onCancel={()=>setExpandedId(null)}
                  />
                )}
              </div>
            ))}
          </>}

          {filteredEA.length===0&&enAttente.length===0&&(
            <div style={{textAlign:"center",padding:"3rem",background:C.greenLight,
              border:`1px solid ${C.greenBorder}`,borderRadius:20}}>
              <div style={{fontSize:36,marginBottom:10}}>✅</div>
              <p style={{margin:0,fontWeight:700,color:C.greenDark,fontSize:16}}>Tout est traité !</p>
            </div>
          )}

          {/* Archivés récents */}
          {filtered(archives).length>0&&<>
            <p style={{fontWeight:700,fontSize:12,color:C.textMuted,margin:"24px 0 10px",
              textTransform:"uppercase",letterSpacing:"0.8px"}}>
              📁 Archivés · {filtered(archives).length}
            </p>
            {filtered(archives).slice(0,10).map(a=>(
              <div key={a.id} style={{background:C.white,borderRadius:12,padding:"10px 16px",
                marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",
                boxShadow:"0 1px 6px rgba(0,0,0,0.04)",
                borderLeft:`3px solid ${a.statut==="validé"?C.green:a.statut==="refusé"?C.redText:"#d97706"}`}}>
                <div>
                  <p style={{margin:"0 0 2px",fontSize:13,fontWeight:600,color:C.text}}>
                    {a.produit} · {a.fournisseur}
                    {a.hors_liste&&<span style={{marginLeft:8,fontSize:10,background:"#fff3e0",color:"#e65100",padding:"1px 6px",borderRadius:10,fontWeight:600}}>Hors liste</span>}
                  </p>
                  <p style={{margin:0,fontSize:11,color:C.textMuted}}>
                    {a.date}
                    {a.rapport?.qualite&&` · Note ${a.rapport.qualite}/5`}
                    {a.litige?.raison&&` · ${a.litige.raison}`}
                  </p>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <Badge status={a.statut}/>
                  <button onClick={()=>deleteArrivage(a.id)}
                    style={{background:"transparent",border:`1px solid ${C.redBorder}`,
                      color:C.redText,borderRadius:8,padding:"3px 7px",cursor:"pointer",fontSize:11}}>🗑</button>
                </div>
              </div>
            ))}
          </>}
        </>}

        {/* ════ PAGE SAISIE ════ */}
        {page==="saisie"&&(
          <div style={{background:C.white,borderRadius:20,boxShadow:"0 4px 24px rgba(0,0,0,0.07)",overflow:"hidden"}}>
            <div style={{background:`linear-gradient(135deg,${C.goldLight},#fff)`,
              borderBottom:`1px solid ${C.goldBorder}`,padding:"16px 20px",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <p style={{margin:0,fontWeight:700,fontSize:15,color:C.text}}>➕ Nouvel arrivage</p>
              <button onClick={()=>setPage("arrivages")}
                style={{fontSize:12,padding:"6px 12px",borderRadius:8,cursor:"pointer",
                  background:"transparent",border:`1px solid ${C.goldBorder}`,color:C.textMuted}}>
                ← Retour
              </button>
            </div>
            <div style={{padding:"16px 20px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
                <Field label="Fournisseur" required>
                  <input value={form.fournisseur} onChange={e=>setForm({...form,fournisseur:e.target.value})}
                    placeholder="Ex : PICVERT" style={inputStyle}/>
                </Field>
                <Field label="Produit" required>
                  <input value={form.produit} onChange={e=>setForm({...form,produit:e.target.value})}
                    placeholder="Ex : Tomate grappe" style={inputStyle}/>
                </Field>
                <Field label="Variété">
                  <input value={form.variete} onChange={e=>setForm({...form,variete:e.target.value})} style={inputStyle}/>
                </Field>
                <Field label="Origine">
                  <input value={form.origine} onChange={e=>setForm({...form,origine:e.target.value})} style={inputStyle}/>
                </Field>
                <Field label="N° Lot interne">
                  <input value={form.lot_interne} onChange={e=>setForm({...form,lot_interne:e.target.value})} style={inputStyle}/>
                </Field>
                <Field label="N° Lot fournisseur">
                  <input value={form.lot_fournisseur} onChange={e=>setForm({...form,lot_fournisseur:e.target.value})} style={inputStyle}/>
                </Field>
                <Field label="Quantité" required>
                  <div style={{display:"flex",gap:8}}>
                    <input type="number" value={form.quantite}
                      onChange={e=>setForm({...form,quantite:e.target.value})}
                      style={{...inputStyle,flex:1}}/>
                    <select value={form.unite} onChange={e=>setForm({...form,unite:e.target.value})}
                      style={{...inputStyle,width:90}}>
                      <option>colis</option><option>kg</option>
                    </select>
                  </div>
                </Field>
                <Field label="Poids colis (kg)">
                  <input type="number" step="0.1" value={form.poids_colis}
                    onChange={e=>setForm({...form,poids_colis:e.target.value})} style={inputStyle}/>
                </Field>
              </div>
              <button onClick={submitArrivage}
                style={{width:"100%",padding:"13px",background:C.gold,color:"#fff",border:"none",
                  borderRadius:12,fontWeight:700,cursor:"pointer",fontSize:15,marginTop:4}}>
                ✓ Enregistrer l'arrivage
              </button>
            </div>
          </div>
        )}

        {/* ════ PAGE HISTORIQUE ════ */}
        {page==="historique"&&<>
          <p style={{fontWeight:700,fontSize:12,color:C.textMuted,margin:"0 0 14px",
            textTransform:"uppercase",letterSpacing:"0.8px"}}>
            📁 Historique complet · {arrivages.length} arrivages
          </p>
          <input value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})}
            placeholder="🔍 Rechercher produit ou fournisseur..."
            style={{...inputStyle,marginBottom:14}}/>
          {arrivages.filter(a=>
            !filters.q ||
            a.produit?.toLowerCase().includes(filters.q.toLowerCase()) ||
            a.fournisseur?.toLowerCase().includes(filters.q.toLowerCase())
          ).map(a=>(
            <div key={a.id} style={{background:C.white,borderRadius:16,
              boxShadow:"0 2px 16px rgba(0,0,0,0.05)",marginBottom:12,overflow:"hidden",
              borderLeft:`4px solid ${a.statut==="validé"?C.green:a.statut==="refusé"?C.redText:a.statut==="sous réserve"?"#d97706":C.amberText}`}}>

              {/* Header arrivage */}
              <div style={{padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <p style={{margin:"0 0 5px",fontWeight:700,fontSize:14,color:C.text}}>
                    {a.produit}{a.variete?` · ${a.variete}`:""}
                    {a.hors_liste&&<span style={{marginLeft:8,fontSize:10,background:"#fff3e0",color:"#e65100",padding:"2px 7px",borderRadius:10,fontWeight:600}}>Hors liste</span>}
                  </p>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    <Pill>🏭 {a.fournisseur}</Pill>
                    <Pill>📦 {a.quantite} {a.unite}</Pill>
                    {a.lot_interne&&<Pill>🔖 {a.lot_interne}</Pill>}
                    {a.origine&&<Pill>🌍 {a.origine}</Pill>}
                    <span style={{fontSize:11,color:C.textMuted,alignSelf:"center"}}>📅 {a.date}</span>
                  </div>
                </div>
                <Badge status={a.statut}/>
              </div>

              {/* Rapport rattaché */}
              {a.rapport?.qualite&&(
                <div style={{borderTop:`1px solid ${C.goldBorder}`,padding:"10px 18px",
                  background:C.goldLight,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:600,color:C.text}}>📋 Rapport agréage</span>
                  <span style={{fontSize:12,color:NOTE_COLORS[a.rapport.qualite],fontWeight:700,
                    background:NOTE_BG[a.rapport.qualite],padding:"2px 8px",borderRadius:20}}>
                    Note {a.rapport.qualite}/5 — {NOTE_LABELS[a.rapport.qualite]}
                  </span>
                  {a.rapport.temperature&&<span style={{fontSize:12,color:C.blueText}}>🌡 {a.rapport.temperature}°C</span>}
                  {a.rapport.poids_mesure&&<span style={{fontSize:12,color:C.textMuted}}>⚖️ {a.rapport.poids_mesure} kg</span>}
                  {a.rapport.observations&&<span style={{fontSize:12,color:C.textMuted,fontStyle:"italic"}}>💬 {a.rapport.observations}</span>}
                  <span style={{fontSize:11,color:C.textMuted}}>👤 {a.rapport.agreeur} · {a.rapport.date_rapport}</span>
                </div>
              )}

              {/* Litige rattaché */}
              {a.litige&&(
                <div style={{borderTop:`1px solid ${C.redBorder}`,padding:"10px 18px",
                  background:a.litige.type==="refusé"?C.red:C.amber,
                  display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:700,
                    color:a.litige.type==="refusé"?C.redText:C.amberText}}>
                    {a.litige.type==="refusé"?"❌ Litige refus":"⚠️ Litige réserve"}
                  </span>
                  <span style={{fontSize:12,color:a.litige.type==="refusé"?C.redText:C.amberText}}>
                    {a.litige.raison}
                  </span>
                  {a.litige.pct&&<span style={{fontSize:12,color:C.textMuted}}>{a.litige.pct}% concerné</span>}
                  {a.litige.lot_fournisseur&&<span style={{fontSize:11,color:C.textMuted}}>Lot : {a.litige.lot_fournisseur}</span>}
                  <span style={{marginLeft:"auto",fontSize:11,
                    background:a.litige.statut==="ouvert"?C.red:"#f0fdf4",
                    color:a.litige.statut==="ouvert"?C.redText:C.greenDark,
                    padding:"2px 8px",borderRadius:20,fontWeight:600,border:`1px solid ${a.litige.statut==="ouvert"?C.redBorder:C.greenBorder}`}}>
                    {a.litige.statut==="ouvert"?"● Ouvert":"✓ Clôturé"}
                  </span>
                </div>
              )}
            </div>
          ))}
        </>}

        {/* ════ PAGE STATS ════ */}
        {page==="stats"&&<>
          <p style={{fontWeight:700,fontSize:12,color:C.textMuted,margin:"0 0 16px",
            textTransform:"uppercase",letterSpacing:"0.8px"}}>
            📊 Stats par fournisseur
          </p>

          {/* KPIs globaux */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
            <StatCard label="Total arrivages" value={arrivages.length} color={C.gold}/>
            <StatCard label="Taux conformité"
              value={arrivages.length?`${Math.round(archives.filter(a=>a.statut==="validé").length/Math.max(archives.length,1)*100)}%`:"—"}
              color={C.greenDark}/>
            <StatCard label="Litiges ouverts"
              value={allLitiges.filter(a=>a.litige?.statut==="ouvert").length}
              color={C.redText}/>
          </div>

          {/* Table fournisseurs */}
          {stats.map((s,i)=>(
            <div key={s.fournisseur} style={{background:C.white,borderRadius:14,
              padding:"14px 18px",marginBottom:10,
              boxShadow:"0 2px 12px rgba(0,0,0,0.05)",
              borderLeft:`4px solid ${s.litiges>0?C.redText:C.green}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <p style={{margin:0,fontWeight:700,fontSize:14,color:C.text}}>{s.fournisseur}</p>
                <div style={{display:"flex",gap:6}}>
                  {s.scoreMoyen&&(
                    <span style={{fontSize:12,fontWeight:700,color:NOTE_COLORS[Math.round(parseFloat(s.scoreMoyen))],
                      background:NOTE_BG[Math.round(parseFloat(s.scoreMoyen))],padding:"2px 8px",borderRadius:20}}>
                      ⭐ {s.scoreMoyen}/5
                    </span>
                  )}
                  {s.tauxLitige>0&&(
                    <span style={{fontSize:12,fontWeight:700,color:C.redText,
                      background:C.red,padding:"2px 8px",borderRadius:20,border:`1px solid ${C.redBorder}`}}>
                      {s.tauxLitige}% litiges
                    </span>
                  )}
                </div>
              </div>
              <div style={{display:"flex",gap:16}}>
                <span style={{fontSize:12,color:C.textMuted}}>{s.total} arrivages</span>
                <span style={{fontSize:12,color:C.greenDark}}>✓ {s.valides} validés</span>
                {s.litiges>0&&<span style={{fontSize:12,color:C.redText}}>⚠ {s.litiges} litiges</span>}
              </div>
              {/* Barre de conformité */}
              <div style={{marginTop:10,height:5,background:"#f3f4f6",borderRadius:10,overflow:"hidden"}}>
                <div style={{height:"100%",background:s.tauxLitige>30?C.redText:s.tauxLitige>10?"#d97706":C.green,
                  width:`${100-s.tauxLitige}%`,borderRadius:10,transition:"width 0.5s"}}/>
              </div>
            </div>
          ))}
        </>}

        {/* ════ MODAL HORS LISTE ════ */}
        {horsListeMode&&(
          <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.5)",
            display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{background:C.white,borderRadius:20,width:"100%",maxWidth:480,
              boxShadow:"0 8px 40px rgba(0,0,0,0.18)",overflow:"hidden",maxHeight:"90vh",overflowY:"auto"}}>
              <div style={{background:"#fff3e0",borderBottom:"1px solid #ffcc80",
                padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <p style={{margin:0,fontWeight:700,fontSize:15,color:"#e65100"}}>⚠️ Litige hors liste</p>
                <button onClick={()=>setHorsListeMode(false)}
                  style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:C.textMuted}}>×</button>
              </div>
              <div style={{padding:"16px 20px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
                  <Field label="Produit" required>
                    <input value={horsListe.produit} onChange={e=>setHorsListe({...horsListe,produit:e.target.value})} style={inputStyle}/>
                  </Field>
                  <Field label="Fournisseur" required>
                    <input value={horsListe.fournisseur} onChange={e=>setHorsListe({...horsListe,fournisseur:e.target.value})} style={inputStyle}/>
                  </Field>
                  <Field label="N° Lot interne">
                    <input value={horsListe.lot_interne} onChange={e=>setHorsListe({...horsListe,lot_interne:e.target.value})} style={inputStyle}/>
                  </Field>
                  <Field label="N° Lot fournisseur">
                    <input value={horsListe.lot_fournisseur} onChange={e=>setHorsListe({...horsListe,lot_fournisseur:e.target.value})} style={inputStyle}/>
                  </Field>
                  <Field label="Origine">
                    <input value={horsListe.origine} onChange={e=>setHorsListe({...horsListe,origine:e.target.value})} style={inputStyle}/>
                  </Field>
                  <Field label="Quantité">
                    <div style={{display:"flex",gap:6}}>
                      <input type="number" value={horsListe.quantite} onChange={e=>setHorsListe({...horsListe,quantite:e.target.value})} style={{...inputStyle,flex:1}}/>
                      <select value={horsListe.unite} onChange={e=>setHorsListe({...horsListe,unite:e.target.value})} style={{...inputStyle,width:80}}><option>colis</option><option>kg</option></select>
                    </div>
                  </Field>
                </div>
                <Field label="Type">
                  <div style={{display:"flex",gap:8}}>
                    {["refusé","sous réserve"].map(t=>(
                      <button key={t} onClick={()=>setHorsListe({...horsListe,type:t})}
                        style={{flex:1,padding:"9px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:12,
                          border:`2px solid ${horsListe.type===t?(t==="refusé"?C.redText:"#d97706"):"#e5e7eb"}`,
                          background:horsListe.type===t?(t==="refusé"?C.red:C.amber):"#fff",
                          color:horsListe.type===t?(t==="refusé"?C.redText:C.amberText):C.textMuted}}>
                        {t==="refusé"?"❌ Refus":"⚠️ Réserve"}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Raison" required>
                  <input value={horsListe.raison} onChange={e=>setHorsListe({...horsListe,raison:e.target.value})}
                    placeholder="Ex : Moisissures, casse..." style={inputStyle}/>
                </Field>
                <Field label="% concerné">
                  <input type="number" min="0" max="100" value={horsListe.pct}
                    onChange={e=>setHorsListe({...horsListe,pct:e.target.value})}
                    style={{...inputStyle,width:100}}/>
                </Field>
                <button onClick={submitHorsListe}
                  style={{width:"100%",padding:"13px",
                    background:horsListe.type==="refusé"?C.redText:"#d97706",
                    color:"#fff",border:"none",borderRadius:12,fontWeight:700,cursor:"pointer",fontSize:14}}>
                  📋 Enregistrer le litige →
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
