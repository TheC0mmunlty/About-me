const $ = (id) => document.getElementById(id);
let fb = null, uid = null, msgs = [], mode = null, unsub = null, problem = "";
const marking = new Set();

function explain(e) {
  const host = location.hostname || "(you opened the file directly, use Live Server)";
  switch (e && e.code) {
    case "auth/operation-not-allowed":
      return "That sign-in method is off. In Firebase: Authentication > Sign-in method > turn on Anonymous and Google.";
    case "auth/configuration-not-found":
      return "In Firebase, open Authentication and click Get started.";
    case "auth/unauthorized-domain":
      return 'In Firebase: Authentication > Settings > Authorized domains > add "' + host + '".';
    case "auth/network-request-failed":
      return "Network problem. Check your internet and try again.";
    case "permission-denied":
      return "Firestore rules aren't published yet. Paste firestore.rules in Firestore > Rules and click Publish.";
  }
  return (e && e.message) || String(e);
}

async function init() {
  try {
    const base = "https://www.gstatic.com/firebasejs/10.12.2/";
    const [appM, A, F, cfg] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-auth.js"),
      import(base + "firebase-firestore.js"),
      import("./firebase-config.js")
    ]);
    const app = appM.initializeApp(cfg.firebaseConfig);
    fb = { auth: A.getAuth(app), db: F.getFirestore(app), A, F, admin: cfg.ADMIN_EMAIL };
    A.getRedirectResult(fb.auth).catch(() => {});
    A.onAuthStateChanged(fb.auth, onUser);
  } catch (e) {
    problem = "Couldn't load Firebase: " + explain(e);
    console.error(e);
  }
  if (mode) open(mode);
}

function onUser(user) {
  if (unsub) { unsub(); unsub = null; }
  if (!user) {
    uid = null; msgs = []; render();
    fb.A.signInAnonymously(fb.auth)
      .then(() => { problem = ""; })
      .catch((e) => { problem = explain(e); console.error(e); if (mode) open(mode); });
    if (mode === "account") drawAccount();
    return;
  }
  uid = user.uid;
  problem = "";
  const { collection, query, where, onSnapshot } = fb.F;
  unsub = onSnapshot(query(collection(fb.db, "messages"), where("uid", "==", uid)), (snap) => {
    msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    render();
  }, (e) => { problem = explain(e); console.error(e); });
  if (mode) open(mode);
}

const unread = () => msgs.filter((m) => m.reply && !m.seen);

function render() {
  const n = unread().length;
  $("mb-badge").hidden = n === 0;
  $("mb-badge").textContent = n;
  if (mode === "inbox") drawInbox();
}

function open(m) {
  mode = m;
  $("mb-panel").hidden = false;
  if (!fb) {
    $("mb-title").textContent = "Messages";
    $("mb-body").innerHTML = '<p class="mb-note" id="mb-s"></p>';
    $("mb-s").textContent = problem || "Connecting...";
    if (problem) $("mb-s").className = "mb-err";
    return;
  }
  if (m === "write") drawWrite();
  else if (m === "inbox") drawInbox();
  else drawAccount();
}

function drawWrite() {
  $("mb-title").textContent = "Send me feedback";
  $("mb-body").innerHTML = `
    <input id="mb-name" maxlength="40" placeholder="Your name (optional)">
    <textarea id="mb-text" maxlength="1000" placeholder="Feedback, support, or just say hi..."></textarea>
    <button class="send" id="mb-send" type="button">Send</button>
    <p class="mb-note" id="mb-status"></p>`;
  const s = $("mb-status");
  if (!uid) {
    s.className = "mb-err";
    s.textContent = (problem ? problem + " " : "") + "You can also use the Sign in / up button, then come back and send.";
  } else {
    s.textContent = "I'll reply in your inbox (a red circle shows when I do).";
  }
  $("mb-send").onclick = async () => {
    const text = $("mb-text").value.trim();
    if (!text) return;
    if (!uid) { s.className = "mb-err"; s.textContent = "Not connected yet. " + (problem || "Try again in a moment."); return; }
    $("mb-send").disabled = true;
    try {
      const { addDoc, collection, serverTimestamp } = fb.F;
      await addDoc(collection(fb.db, "messages"), {
        uid, name: $("mb-name").value.trim(), text,
        reply: "", seen: false, createdAt: serverTimestamp()
      });
      $("mb-text").value = "";
      s.className = "mb-note";
      s.textContent = "Sent! Check your inbox for my reply.";
    } catch (e) {
      s.className = "mb-err";
      s.textContent = "Couldn't send: " + explain(e);
      console.error(e);
    }
    $("mb-send").disabled = false;
  };
}

function drawInbox() {
  if (!fb) return;
  $("mb-title").textContent = "Your inbox";
  const body = $("mb-body");
  body.textContent = "";
  if (!uid) {
    body.innerHTML = '<p class="mb-err" id="mb-s"></p>';
    $("mb-s").textContent = (problem ? problem + " " : "") + "Or use the Sign in / up button.";
    return;
  }
  if (!msgs.length) {
    body.innerHTML = '<p class="mb-note">No messages yet. Use the Feedback button to send one.</p>';
    return;
  }
  msgs.forEach((m) => {
    const item = document.createElement("div");
    item.className = "mb-item";
    const you = document.createElement("div");
    you.className = "mb-you";
    you.textContent = "You: " + m.text;
    item.appendChild(you);
    const r = document.createElement("div");
    if (m.reply) {
      r.className = "mb-reply" + (m.seen ? "" : " new");
      r.textContent = "Spark: " + m.reply;
    } else {
      r.className = "mb-note";
      r.textContent = "Waiting for a reply...";
    }
    item.appendChild(r);
    body.appendChild(item);
    if (m.reply && !m.seen && !marking.has(m.id)) {
      marking.add(m.id);
      const { updateDoc, doc } = fb.F;
      setTimeout(() => updateDoc(doc(fb.db, "messages", m.id), { seen: true }).catch(console.error), 1500);
    }
  });
}

function drawAccount() {
  if (!fb) return;
  $("mb-title").textContent = "Sign in / Sign up";
  const user = fb.auth.currentUser;
  const body = $("mb-body");
  body.innerHTML = '<p class="mb-note" id="mb-who"></p><button class="send" id="mb-act" type="button"></button><p class="mb-err" id="mb-status"></p>';
  if (user && !user.isAnonymous) {
    $("mb-who").textContent = "Signed in as " + (user.email || user.displayName);
    $("mb-act").textContent = "Sign out";
    $("mb-act").onclick = () => fb.A.signOut(fb.auth).catch(console.error);
    if (user.email === fb.admin) {
      const a = document.createElement("a");
      a.href = "admin.html";
      a.textContent = "Open admin dashboard";
      a.style.cssText = "display:block;margin-top:.8rem;font-weight:600";
      body.appendChild(a);
    }
  } else {
    $("mb-who").textContent = "Sign in or sign up with Google to keep your inbox on any device. Your past messages stay with you.";
    $("mb-act").textContent = "Continue with Google";
    $("mb-act").onclick = google;
  }
}

async function google() {
  const { GoogleAuthProvider, linkWithPopup, signInWithPopup, signInWithRedirect, signInWithCredential } = fb.A;
  const provider = new GoogleAuthProvider();
  const status = (t) => { const s = $("mb-status"); if (s) s.textContent = t; };
  status("Opening Google...");
  try {
    const u = fb.auth.currentUser;
    if (u && u.isAnonymous) await linkWithPopup(u, provider);
    else await signInWithPopup(fb.auth, provider);
    problem = "";
    drawAccount();
  } catch (e) {
    if (e.code === "auth/credential-already-in-use" || e.code === "auth/email-already-in-use") {
      const cred = GoogleAuthProvider.credentialFromError(e);
      if (cred) {
        try { await signInWithCredential(fb.auth, cred); drawAccount(); return; } catch (e2) { e = e2; }
      }
    }
    if (e.code === "auth/popup-blocked") { signInWithRedirect(fb.auth, provider); return; }
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") { status(""); return; }
    console.error(e);
    status(explain(e));
  }
}

$("mb-write").onclick = () => open("write");
$("mb-inbox").onclick = () => open("inbox");
$("mb-acct").onclick = () => open("account");
$("mb-close").onclick = () => { $("mb-panel").hidden = true; mode = null; };

init();
