const $ = (id) => document.getElementById(id);
let fb = null, initError = "", uid = null, msgs = [], mode = null, unsub = null;
const marking = new Set();

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
    A.onAuthStateChanged(fb.auth, onUser);
  } catch (e) {
    initError = e.message || String(e);
    console.error(e);
  }
  if (mode) open(mode);
}

function onUser(user) {
  if (unsub) { unsub(); unsub = null; }
  if (!user) {
    uid = null; msgs = []; render();
    fb.A.signInAnonymously(fb.auth).catch((e) => { initError = e.message; console.error(e); });
    return;
  }
  uid = user.uid;
  const { collection, query, where, onSnapshot } = fb.F;
  unsub = onSnapshot(query(collection(fb.db, "messages"), where("uid", "==", uid)), (snap) => {
    msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    render();
  }, console.error);
  if (mode === "account") drawAccount();
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
    $("mb-body").innerHTML = initError
      ? '<p class="mb-err"></p><p class="mb-note">Check firebase-config.js and your Firebase setup, then refresh.</p>'
      : '<p class="mb-note">Connecting...</p>';
    if (initError) $("mb-body").querySelector(".mb-err").textContent = "Couldn't connect: " + initError;
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
    <p class="mb-note" id="mb-status">I'll reply in your inbox (a red circle shows when I do).</p>`;
  $("mb-send").onclick = async () => {
    const text = $("mb-text").value.trim();
    if (!text) return;
    if (!uid) { $("mb-status").textContent = "Still connecting. Try again in a moment."; return; }
    $("mb-send").disabled = true;
    try {
      const { addDoc, collection, serverTimestamp } = fb.F;
      await addDoc(collection(fb.db, "messages"), {
        uid, name: $("mb-name").value.trim(), text,
        reply: "", seen: false, createdAt: serverTimestamp()
      });
      $("mb-text").value = "";
      $("mb-status").textContent = "Sent! Check your inbox for my reply.";
    } catch (e) {
      $("mb-status").textContent = "Couldn't send: " + e.message;
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
  const { GoogleAuthProvider, linkWithPopup, signInWithPopup } = fb.A;
  const provider = new GoogleAuthProvider();
  const status = (t) => { if ($("mb-status")) $("mb-status").textContent = t; };
  try {
    const u = fb.auth.currentUser;
    if (u && u.isAnonymous) await linkWithPopup(u, provider);
    else await signInWithPopup(fb.auth, provider);
    drawAccount();
  } catch (e) {
    if (e.code === "auth/credential-already-in-use") {
      try { await signInWithPopup(fb.auth, provider); drawAccount(); } catch (e2) { status(e2.message); }
    } else if (e.code !== "auth/popup-closed-by-user") {
      status(e.message);
    }
  }
}

$("mb-write").onclick = () => open("write");
$("mb-inbox").onclick = () => open("inbox");
$("mb-acct").onclick = () => open("account");
$("mb-close").onclick = () => { $("mb-panel").hidden = true; mode = null; };

init();
