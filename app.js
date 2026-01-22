/************************************************************
 * GLOBAL STATE
 ************************************************************/
const API_BASE =
  "https://script.google.com/macros/s/AKfycbyMYbAH7czC9EMTPMCGcyDzVOWHkHqOkkXD4ApE_TZ9hQsSBhVx0K9LQ2UFChMzVHEM/exec";


let dataReady = false;
let historySearch = "";
let jobMode = "open"; // "open" | "close"

let currentScreen = "home";
let currentEquipmentId = null;
let currentResultData = null;
let editingInspection = null;
let scannedCarNumber = null;
let scanStream = null;
let vehicles = [];
let inspections = [];
let historyMode = "all"; 
let failReason  = "all"; 

/* inspection state (ต้องตรงกับ backend) */
let inspectionData = {
  "engine-oil": null,
  coolant: null,
  tire: null,
  light: null
};

/************************************************************
 * HELPERS
 ************************************************************/
function lockUI() {
  document.body.classList.add("app-locked");

  document.querySelectorAll(
    "button, .nav-item, input, textarea, select"
  ).forEach(el => {
    el.disabled = true;
  });
}

function unlockUI() {
  document.body.classList.remove("app-locked");

  document.querySelectorAll(
    "button, .nav-item, input, textarea, select"
  ).forEach(el => {
    el.disabled = false;
  });
}

function highlightCloseRequired() {
  const kmEnd = $("km-end");
  const infoEnd = $("info-end");

  if (jobMode === "close") {
    kmEnd?.classList.add("required");
    infoEnd?.classList.add("required");
  } else {
    kmEnd?.classList.remove("required");
    infoEnd?.classList.remove("required");
  }
}

function setJobMode(mode) {
  jobMode = mode; // "open" | "close"

  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.mode === mode
    );
  });

  highlightCloseRequired();
  applyJobModeLock();   // 👈 เพิ่มบรรทัดนี้
  updateSubmitButton();
}



const $ = (id) => document.getElementById(id);

function setActiveNav(screen) {
  document.querySelectorAll(".nav-item")
    .forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.screen === screen
      );
    });
}

function isFail(checklist) {
  if (!checklist) return false;
  return Object.values(checklist).some(v => v !== "normal");
}


function navigateToScreen(name) {
  document.querySelectorAll(".screen").forEach(s =>
    s.classList.remove("active")
  );

  const map = {
    home: "home-screen",
    detail: "detail-screen",
    inspection: "inspection-screen",
    history: "history-screen",
    profile: "profile-screen",
    result: "result-screen",
    scan: "scan-screen",
    "all-ext": "all-ext-screen"
  };

  const target = $(map[name]);
  if (!target) return;

  target.classList.add("active");
  currentScreen = name;

    setActiveNav(name);


  if (name === "history") {
    if (historyMode === "fail") {
      renderFailList();
    } 
    else if (historyMode === "pass") {
      renderPassList();
    }
    else {
      renderHistory();
    }
  }
  if (name === "all-ext") renderVehicleList();
}

/************************************************************
 * LOAD DATA FROM BACKEND
 ************************************************************/
async function loadVehicles() {
  const res = await fetch(`${API_BASE}?action=getExtinguishers`)
    .then(r => r.json());

  if (res.success) {
    vehicles = res.extinguishers;
  }
}

async function loadInspections() {
  const res = await fetch(`${API_BASE}?action=getInspections`)
    .then(r => r.json());

  if (res.success) {
    inspections = res.inspections;
  }
}

/************************************************************
 * VEHICLE LIST
 ************************************************************/
function renderVehicleList() {
  const box = $("ext-list");
  const empty = $("ext-empty");

  if (!vehicles.length) {
    empty.style.display = "block";
    box.innerHTML = "";
    return;
  }

  empty.style.display = "none";

  box.innerHTML = vehicles.map(v => `
    <div class="history-item"
         onclick="startInspectionFromVehicle('${v.id}')">
      <div class="history-header">
        <span class="history-id">${v.id}</span>
        <span>${v.type}</span>
        <span class="status-badge ${
          v.status === "Good" ? "status-good" :
          v.status === "Need Service" ? "status-bad" : "status-warn"
        }">${v.status}</span>
      </div>
      <div class="history-inspector">${v.location}</div>
      <div class="history-date-small">
        ตรวจล่าสุด: ${v.lastInspection || "-"}
      </div>
    </div>
  `).join("");
}
function startInspectionFromVehicle(carNumber) {
  // reset ฟอร์ม
  startInspection();

  // ใส่เบอร์รถอัตโนมัติ
  const carInput = $("car-number");
  carInput.value = carNumber;
  carInput.readOnly = true;
  carInput.classList.add("locked");

  // รีเฟรชปุ่ม submit
  updateSubmitButton();

  // ไปหน้า inspection
  navigateToScreen("inspection");
}


async function openVehicleWithLoading(el, id) {
  el.classList.add("loading");

  showLoading(`กำลังโหลดข้อมูลรถ…`);

  try {
    await openVehicleDetail(id);
    navigateToScreen("detail");
  } catch (e) {
    showErrorModal(e.message || "เกิดข้อผิดพลาด");
  } finally {
    el.classList.remove("loading");
    hideLoading();
  }
}

function showResultScreen(data) {
  currentResultData = data;

  const pass = data.status === "Good";

  $("result-equipment-id").textContent = data.car_number || "-";
  $("result-inspector").textContent = data.driver_name || "-";
  $("result-timestamp").textContent =
    new Date(data.timestamp || Date.now()).toLocaleString();

  $("result-title").textContent =
    pass ? "บันทึกผลสำเร็จ" : "พบข้อบกพร่อง";

  $("result-subtitle").textContent =
    pass
      ? "รถผ่านการตรวจสอบความปลอดภัย"
      : "รถต้องเข้ารับการซ่อม";

  $("result-status").textContent =
    pass ? "ผ่าน" : "ต้องซ่อม";

  $("result-icon").textContent = pass ? "✓" : "!";
  $("result-icon").className =
    `result-icon ${pass ? "result-pass" : "result-fail"}`;

  navigateToScreen("result");
}


async function openVehicleDetail(id) {
  const res = await fetch(`${API_BASE}?action=getExtinguisher&id=${id}`)
    .then(r => r.json());

  if (!res.success) {
    throw new Error("ไม่พบข้อมูลรถ");
  }

  const v = res.extinguisher;
  currentEquipmentId = v.id;

  $("detail-equipment-id").textContent = v.id;
  $("detail-location").textContent = v.location;
  $("detail-type").textContent = v.type;
  $("detail-size").textContent = "-";
  $("detail-last-inspection").textContent = v.lastInspection || "-";
  $("detail-expiry").textContent = "-";

  $("detail-status").textContent = v.status || "-";
  $("detail-image").src = `${v.id}.jpg`;
  $("detail-image").style.display = "block";

  return v; // ⭐ สำคัญ
}

function showInspectionResult({
  carNumber,
  inspector,
  status,
  timestamp
}) {
  $("result-equipment-id").textContent = carNumber;
  $("result-inspector").textContent = inspector;
  $("result-timestamp").textContent =
    new Date(timestamp).toLocaleString();

  const pass = status === "Good";

  $("result-title").textContent =
    pass ? "บันทึกผลสำเร็จ" : "พบข้อบกพร่อง";

  $("result-subtitle").textContent =
    pass
      ? "อุปกรณ์ผ่านการตรวจสอบความปลอดภัย"
      : "อุปกรณ์ต้องเข้ารับการซ่อม";

  $("result-status").textContent =
    pass ? "ผ่าน" : "ต้องซ่อม";

  $("result-icon").textContent = pass ? "✓" : "!";
  $("result-icon").className =
    `result-icon ${pass ? "result-pass" : "result-fail"}`;

  navigateToScreen("result");
}

async function openVehicleResult(carNumber) {
  showLoading("กำลังโหลดข้อมูล…");

  try {
    const item = inspections.find(i => i.car_number == carNumber);
    if (!item) throw new Error("ไม่พบข้อมูลการตรวจสอบ");

    const checklist = item.checklist || {
      "engine-oil": item.engine_oil,
      coolant: item.coolant,
      tire: item.tire,
      light: item.light
    };

    showResultScreen({
      car_number: item.car_number,
      driver_name: item.driver_name,
      status: isFail(checklist) ? "Need Service" : "Good",
      timestamp: item.timestamp
    });

  } catch (e) {
    showErrorModal(e.message);
  } finally {
    hideLoading();
  }
}


function fillInspectionForm(i) {
  $("car-number").value   = i.car_number || "";
  $("emp-id").value       = i.emp_id || "";
  $("driver-name").value  = i.driver_name || "";
  $("ad-name").value      = i.ad_name || "";
  $("km-start").value     = i.km_start || "";
  $("km-end").value       = i.km_end || "";
  $("destination").value  = i.destination || "";

  inspectionData = {
    "engine-oil": i.engine_oil,
    coolant: i.coolant,
    tire: i.tire,
    light: i.light
  };

  // toggle buttons
  document.querySelectorAll(".toggle-btn").forEach(btn => {
    const q = btn.dataset.question;
    const v = btn.dataset.value;
    btn.classList.toggle("active", inspectionData[q] === v);
  });

  updateSubmitButton();
}
/************************************************************
 * Scan
 ************************************************************/
function openInspectionWithCarNumber(carNumber) {
  startInspection();

  const carInput = $("car-number");
  carInput.value = carNumber;
  carInput.readOnly = true;
  carInput.classList.add("locked");

  setJobMode("open"); // 🚚 ออกงาน
}


function stopQRScan() {
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
}


async function startQRScan() {
  navigateToScreen("scan");

  const video = document.getElementById("qr-video");

  scanStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });

  video.srcObject = scanStream;
  video.setAttribute("playsinline", true);
  video.play();

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height);

      if (code) {
        stopQRScan();

        scannedCarNumber = code.data;

        // 👉 เปิดฟอร์ม inspection พร้อมกรอก car number
        openInspectionWithCarNumber(scannedCarNumber);
        return;
      }
    }
    requestAnimationFrame(scanLoop);
  }

  scanLoop();
}


/************************************************************
 * START INSPECTION
 ************************************************************/
function openInspectionWithCarNumber(carNumber) {
  startInspection();

  const carInput = $("car-number");
  carInput.value = carNumber;

  // 🔒 ล็อกไม่ให้แก้
  carInput.readOnly = true;
  carInput.classList.add("locked");

  updateSubmitButton();
}

function startInspection() {
  inspectionData = {
    "engine-oil": null,
    coolant: null,
    tire: null,
    light: null
  };

  document.querySelectorAll(".form-input").forEach(i => {
    i.value = "";
    i.readOnly = false;
    i.classList.remove("locked");
  });

  document.querySelectorAll(".toggle-btn").forEach(b => {
    b.classList.remove("active", "locked");
    b.disabled = false;
  });

  const fileInput = $("car-images");
  if (fileInput) fileInput.disabled = false;

  updateSubmitButton();
  navigateToScreen("inspection");
}

/************************************************************
 * TOGGLE BUTTONS
 ************************************************************/
document.querySelectorAll(".toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const q = btn.dataset.question;
    const v = btn.dataset.value;

    document
      .querySelectorAll(`.toggle-btn[data-question="${q}"]`)
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");
    inspectionData[q] = v;

    updateSubmitButton();
  });
});

/************************************************************
 * INPUT LISTENER
 ************************************************************/
[
  "emp-id",
  "driver-name",
  "car-number",
  "km-start",
  "km-end",
  "destination"
].forEach(id => {
  $(id)?.addEventListener("input", updateSubmitButton);
});

["img-start", "img-end", "img-pic"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", updateSubmitButton);
});

/************************************************************
 * VALIDATION
 ************************************************************/
function updateSubmitButton() {
  const btn = $("submit-inspection-btn");

  btn.disabled = !isInspectionFormValid();

  btn.innerHTML =
    jobMode === "close"
      ? `<i class="fa-solid fa-circle-xmark"></i> ปิดงาน`
      : `<i class="fa-solid fa-truck"></i> บันทึกออกงาน`;
}

/************************************************************
 * SUBMIT (ตรง backend 100%)
 ************************************************************/
async function submitInspection() {
  if (jobMode === "close" && editingInspection?.km_end) {
    showErrorModal("งานนี้ถูกปิดแล้ว ไม่สามารถบันทึกซ้ำได้");
    return;
  }

  showLoading("กำลังบันทึกข้อมูล…");

  try {
    // (payload + fetch ตามของคุณเดิม)

    const payload = {
      car_number: $("car-number").value.trim(),
      emp_id: $("emp-id").value.trim(),
      driver_name: $("driver-name").value.trim(),
      ad_name: $("ad-name").value.trim(),
      km_start: $("km-start").value.trim(),
      km_end: $("km-end").value.trim(),
      destination: $("destination").value.trim(),

      checklist: inspectionData,
      images: await getImagesBase64(),
      timestamp: new Date().toISOString(),

      // ⭐ สำคัญ: ถ้ามี = แก้ไข, ไม่มี = เพิ่มใหม่
      rowIndex: editingInspection?.rowIndex || null
    };

    const form = new FormData();
    form.append("action", "submitVehicleInspection");
    form.append("payload", JSON.stringify(payload));

    const res = await fetch(API_BASE, {
      method: "POST",
      body: form
    }).then(r => r.json());

    hideLoading();

    console.log("SUBMIT RESPONSE:", res); // 👈 debug

    if (!res || res.success !== true) {
      showErrorModal(res?.message || "บันทึกไม่สำเร็จ (backend)");
      return;
    }


// 🧹 reset state
editingInspection = null;
resetInspectionForm();

// 🔄 โหลดข้อมูลใหม่ทั้งหมด (สำคัญมาก)
await loadVehicles();     // ⬅️ status + lastInspection ใหม่
await loadInspections();  // ⬅️ inspection ใหม่

// 🔁 refresh dashboard + list
updateDashboard();
updatePassFailDashboard();

// 🖥️ ถ้าอยู่หน้า all-ext ให้ render ใหม่
if (currentScreen === "all-ext") {
  renderVehicleList();
}

// ✅ แสดงผลจากข้อมูลล่าสุด
showResultScreen({
  car_number: payload.car_number,
  driver_name: payload.driver_name,
  status: isFail(payload.checklist) ? "Need Service" : "Good",
  timestamp: payload.timestamp
});


  } catch (err) {
    hideLoading();
    showErrorModal(err.message || "เกิดข้อผิดพลาด");
  }
}

function resetInspectionForm() {
  // 🔹 reset state
  inspectionData = {
    "engine-oil": null,
    coolant: null,
    tire: null,
    light: null
  };

  // 🔹 clear input text / number
  document.querySelectorAll(".form-input").forEach(el => {
    if (el.type !== "file") el.value = "";
  });

  // 🔹 clear file input
  const fileInput = document.getElementById("car-images");
  if (fileInput) fileInput.value = "";

  const fileInfo = document.getElementById("file-info");
  if (fileInfo) fileInfo.textContent = "ยังไม่ได้เลือกรูป";

  // 🔹 reset toggle buttons
  document.querySelectorAll(".toggle-btn")
    .forEach(btn => btn.classList.remove("active"));

  // 🔹 disable submit
  updateSubmitButton();
}

function showSuccessModal(message, imageCount) {
  const box = document.getElementById("result-content");
  const modal = document.getElementById("result-modal");

  box.className = "modal-box success";
  box.innerHTML = `
    <div class="modal-icon"><i class="fa-solid fa-circle-check" style="color: #00ad1d;"></i></div>
    <h3 style="color:#16a34a;margin-bottom:6px;">บันทึกสำเร็จ</h3>

    <p style="font-size:14px;color:#475569;">
      ${message}
    </p>

    <div style="
      margin:12px 0;
      padding:10px;
      border-radius:12px;
      background:#f0fdf4;
      color:#166534;
      font-size:14px;
    ">
      <i class="fa-solid fa-folder-open" style="color: #1a9cff;"></i> อัปโหลดไฟล์ <b>${imageCount}</b> ไฟล์
    </div>

    <button class="modal-btn" onclick="closeResultModal()">ตกลง</button>
  `;

  modal.classList.add("show");
}

function showErrorModal(text = "บันทึกไม่สำเร็จ") {
  const box = document.getElementById("result-content");
  const modal = document.getElementById("result-modal");

  box.className = "modal-box error";
  box.innerHTML = `
    <div class="modal-icon"><i class="fa-solid fa-xmark" style="color: #ff0000;"></i></i></div>
    <h3 style="color:#dc2626;">ตรวจสอบ</h3>
    <p style="font-size:14px;color:#475569;">
      ${text}
    </p>

    <button class="modal-btn" onclick="closeResultModal()">
      ปิด
    </button>
  `;

  modal.classList.add("show");
}

function closeResultModal() {
  document
    .getElementById("result-modal")
    .classList.remove("show");
}

async function getImagesBase64() {
  return {
    start: await filesToBase64(document.getElementById("img-start")?.files),
    end:   await filesToBase64(document.getElementById("img-end")?.files),
    pic:   await filesToBase64(document.getElementById("img-pic")?.files)
  };
}

async function filesToBase64(fileList) {
  if (!fileList || !fileList.length) return [];

  const arr = [];
  for (let f of fileList) {
    arr.push({
      name: f.name,
      type: f.type,
      data: await fileToBase64(f)
    });
  }
  return arr;
}


function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(reader.result.split(",")[1]); // ตัด data:image/...;
    reader.readAsDataURL(file);
  });
}

function bindFileInfo(inputId, infoId) {
  const input = document.getElementById(inputId);
  const info  = document.getElementById(infoId);

  if (!input || !info) return;

  input.addEventListener("change", () => {
    const n = input.files.length;
    info.textContent =
      n === 0 ? "ยังไม่ได้เลือกรูป" :
      n === 1 ? input.files[0].name :
      `เลือกรูปแล้ว ${n} รูป`;
  });
}

bindFileInfo("img-start", "info-start");
bindFileInfo("img-end", "info-end");
bindFileInfo("img-pic", "info-pic");

/************************************************************
 * HISTORY
 ************************************************************/
function renderHistory() {
  const box = $("history-list");
  if (!box) return;

  const list = inspections
    .filter(i => {
      // 🔍 search (เลขรถ + ชื่อพนักงานขับรถ)
      if (historySearch) {
        const text =
          `${i.car_number || ""} ${i.driver_name || ""}`.toLowerCase();
        if (!text.includes(historySearch)) return false;
      }
      return true;
    })
    // 🔽 เรียงจากล่าสุด → เก่าสุด
    .sort((a, b) =>
      new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
    );

  if (!list.length) {
    box.innerHTML = "<div>ยังไม่มีประวัติ</div>";
    return;
  }

  box.innerHTML = list.map(i => `
    <div class="history-item" onclick="openVehicleResult('${i.car_number}')">
      <div class="history-header">
        <span class="history-id">${i.car_number}</span>
        <span>${i.driver_name || "-"}</span>
        <span class="status-badge status-good">บันทึก</span>
      </div>
      <div class="history-date-small">
        ${new Date(i.timestamp).toLocaleString()}
      </div>
    </div>
  `).join("");
}

function isInspectionFormValid() {
  const emp   = $("emp-id").value.trim();
  const drv   = $("driver-name").value.trim();
  const car   = $("car-number").value.trim();
  const kmS   = $("km-start").value.trim();
  const kmE   = $("km-end").value.trim();
  const dest  = $("destination").value.trim();

  // checklist ต้องครบ
  const checklistOK =
    Object.values(inspectionData).every(v => v !== null);

  // รูปเลขไมล์ออก ต้องมีเสมอ
  const imgStartOK =
    document.getElementById("img-start")?.files.length > 0;

  // 🔴 เฉพาะปิดงาน → บังคับ km-end + img-end
  const closeModeOK =
    jobMode !== "close" ||
    (
      kmE &&
      document.getElementById("img-end")?.files.length > 0
    );

  return (
    emp &&
    drv &&
    car &&
    kmS &&
    dest &&
    checklistOK &&
    imgStartOK &&
    closeModeOK
  );
}


function lockInspectionFormExceptEndKmAndImages() {
  // 🔒 input text ทั้งหมด
  document.querySelectorAll(".form-input").forEach(input => {
    input.readOnly = true;
    input.classList.add("locked");
  });

  // 🔓 km-end
  const kmEnd = $("km-end");
  if (kmEnd) {
    kmEnd.readOnly = false;
    kmEnd.classList.remove("locked");
  }

  // 🔒 checklist
  document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.disabled = true;
    btn.classList.add("locked");
  });

  // 🔓 อนุญาตแนบรูป "เข้า" + "ความเสียหาย"
  ["img-end", "img-pic"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}

/************************************************************
 * BUTTON EVENTS
 ************************************************************/
$("start-inspection-btn")?.addEventListener("click", startInspection);
$("submit-inspection-btn")?.addEventListener("click", submitInspection);
$("cancel-inspection-btn")?.addEventListener("click", () => navigateToScreen("home"));
$("back-to-home-btn")?.addEventListener("click", () => navigateToScreen("home"));
$("view-history-btn")?.addEventListener("click", () => {
  historyMode = "all";
  navigateToScreen("history");
});
$("card-fail")?.addEventListener("click", () => {
  historyMode = "fail";
  failReason = "all";

  document.querySelectorAll(".filter-btn")
    .forEach(b => b.classList.remove("active"));
  document.querySelector('[data-reason="all"]')?.classList.add("active");

  navigateToScreen("history");
});

$("card-pass")?.addEventListener("click", () => {
  historyMode = "pass";
  navigateToScreen("history");
});

$("new-inspection-btn")?.addEventListener("click", () => {
  if (!currentResultData) return;

  const item = inspections.find(
    i => i.car_number === currentResultData.car_number
  );
  if (!item) return;

  // ❌ ถ้าปิดงานแล้ว → ห้ามแก้
  if (isJobClosed(item)) {
    showErrorModal("งานนี้ถูกปิดเรียบร้อยแล้ว ไม่สามารถแก้ไขได้");
    return;
  }

  // ✅ ยังไม่ปิด → อนุญาตปิดงาน
  editingInspection = item;
  fillInspectionForm(item);

  setJobMode("close");
  lockInspectionFormExceptEndKmAndImages();

  navigateToScreen("inspection");
});



$("history-search")?.addEventListener("input", e => {
  historySearch = e.target.value.trim().toLowerCase();

  if (historyMode === "fail") renderFailList();
  else if (historyMode === "pass") renderPassList();
  else renderHistory();
});

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    const screen = btn.dataset.screen;

    if (screen === "scan") {
      startQRScan();
      return;
    }

    if (screen === "history") {
      historyMode = "all";
    }

    navigateToScreen(screen);
  });
});


function updateDashboard() {
  const todayEl = $("sum-today");
  const weekEl = $("sum-week");
  const monthEl = $("sum-month");
  const totalEl = $("sum-total");

  if (!todayEl || !weekEl || !monthEl || !totalEl) return;

  const now = new Date();

  let today = 0;
  let week = 0;
  let month = 0;
  let total = inspections.length;

  inspections.forEach(i => {
    const d = new Date(i.timestamp);
    if (isNaN(d)) return;

    // วันนี้
    if (d.toDateString() === now.toDateString()) {
      today++;
    }

    // สัปดาห์นี้ (ย้อนหลัง 7 วัน)
    const diffDays = (now - d) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) {
      week++;
    }

    // เดือนนี้
    if (
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    ) {
      month++;
    }
  });

  todayEl.textContent = today;
  weekEl.textContent = week;
  monthEl.textContent = month;
  totalEl.textContent = total;
}

function updatePassFailDashboard() {
  const passEl = $("sum-pass");
  const failEl = $("sum-fail");

  let pass = 0;
  let fail = 0;

  inspections.forEach(i => {
    const checklist = i.checklist || {
      "engine-oil": i.engine_oil,
      coolant: i.coolant,
      tire: i.tire,
      light: i.light
    };

    if (isFail(checklist)) fail++;
    else pass++;
  });

  passEl.textContent = pass;
  failEl.textContent = fail;

  renderPassFailChart(pass, fail);
  renderReasonChart();
}


function renderFailList() {
  const box = $("history-list");
  if (!box) return;

  const failInspections = inspections
    .filter(i => {
      const checklist = i.checklist || {
        "engine-oil": i.engine_oil,
        coolant: i.coolant,
        tire: i.tire,
        light: i.light
      };

      // ❌ ไม่ใช่ fail
      if (!isFail(checklist)) return false;

      // ❌ ไม่ตรง reason
      if (!isFailByReason(checklist, failReason)) return false;

      // 🔍 search (เลขรถ + ชื่อคนขับ)
      if (historySearch) {
        const text =
          `${i.car_number || ""} ${i.driver_name || ""}`.toLowerCase();
        if (!text.includes(historySearch)) return false;
      }

      return true;
    })
    // 🔽 เรียงล่าสุด → เก่าสุด
    .sort((a, b) =>
      new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
    );

  if (!failInspections.length) {
    box.innerHTML = "<div>🎉 ไม่พบรถที่ต้องซ่อมตามเงื่อนไข</div>";
    return;
  }

  box.innerHTML = failInspections.map(i => `
    <div class="history-item" onclick="openVehicleResult('${i.car_number}')">
      <div class="history-header">
        <span class="history-id">${i.car_number}</span>
        <span class="status-badge status-bad">ต้องซ่อม</span>
      </div>
      <div class="history-inspector">
        พนักงานขับรถ: ${i.driver_name || "-"}
      </div>
      <div class="history-date-small">
        ${new Date(i.timestamp).toLocaleString()}
      </div>
    </div>
  `).join("");
}

function updateRepeatFailDashboard(days = 30) {
  const el = $("sum-repeat-fail");
  if (!el) return;

  const now = new Date();
  const map = {};

  inspections.forEach(i => {
    const d = new Date(i.timestamp);
    if (isNaN(d)) return;

    const diffDays = (now - d) / (1000 * 60 * 60 * 24);
    if (diffDays < 0 || diffDays > days) return;

    const checklist = i.checklist || {
      "engine-oil": i.engine_oil,
      coolant: i.coolant,
      tire: i.tire,
      light: i.light
    };

    if (!isFail(checklist)) return;

    map[i.car_number] = (map[i.car_number] || 0) + 1;
  });

  el.textContent = Object.values(map).filter(c => c > 1).length;
}


function renderPassList() {
  const box = $("history-list");
  if (!box) return;

  const passInspections = inspections
    .filter(i => {
      const checklist = i.checklist || {
        "engine-oil": i.engine_oil,
        coolant: i.coolant,
        tire: i.tire,
        light: i.light
      };

      // ❌ เป็น fail → ตัดทิ้ง
      if (isFail(checklist)) return false;

      // 🔍 search (เลขรถ + ชื่อคนขับ)
      if (historySearch) {
        const text =
          `${i.car_number || ""} ${i.driver_name || ""}`.toLowerCase();
        if (!text.includes(historySearch)) return false;
      }

      return true;
    })
    // 🔽 เรียงล่าสุด → เก่าสุด
    .sort((a, b) =>
      new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
    );

  if (!passInspections.length) {
    box.innerHTML = "<div>🚗 ยังไม่มีรถที่ผ่าน</div>";
    return;
  }

  box.innerHTML = passInspections.map(i => `
    <div class="history-item" onclick="openVehicleResult('${i.car_number}')">
      <div class="history-header">
        <span class="history-id">${i.car_number}</span>
        <span class="status-badge status-good">ผ่าน</span>
      </div>
      <div class="history-inspector">
        พนักงานขับรถ: ${i.driver_name || "-"}
      </div>
      <div class="history-date-small">
        ${new Date(i.timestamp).toLocaleString()}
      </div>
    </div>
  `).join("");
}


document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    failReason = btn.dataset.reason;

    // filter ใช้เฉพาะโหมด fail
    if (historyMode === "fail") {
      renderFailList();
    }
  });
});

function isFailByReason(checklist, reason) {
  if (!checklist) return false;

  switch (reason) {
    case "engine":
      return checklist["engine-oil"] && checklist["engine-oil"] !== "normal";

    case "coolant":
      return checklist.coolant && checklist.coolant !== "normal";

    case "tire":
      return checklist.tire && checklist.tire !== "normal";

    case "light":
      return checklist.light && checklist.light !== "normal";

    case "all":
    default:
      return Object.values(checklist).some(v => v !== "normal");
  }
}

let passFailChart;
let reasonChart;

function renderPassFailChart(pass, fail) {
  const ctx = document.getElementById("passFailChart");
  if (!ctx) return;

  if (passFailChart) passFailChart.destroy();

  passFailChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["รถผ่าน", "ต้องซ่อม"],
      datasets: [{
        data: [pass, fail],
        backgroundColor: ["#22c55e", "#ef4444"],
        borderWidth: 0
      }]
    },
  options: {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    plugins: {
      legend: {
        display: true,          // ✅ เปิด
        position: "bottom",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          padding: 16
        }
      }
    }
  }
  });
}

function renderReasonChart() {
  const ctx = document.getElementById("reasonChart");
  if (!ctx) return;

  let engine = 0, coolant = 0, tire = 0, light = 0;

  inspections.forEach(i => {
    const checklist = i.checklist || {
      "engine-oil": i.engine_oil,
      coolant: i.coolant,
      tire: i.tire,
      light: i.light
    };

    if (!checklist) return;

    if (checklist["engine-oil"] !== "normal") engine++;
    if (checklist.coolant !== "normal") coolant++;
    if (checklist.tire !== "normal") tire++;
    if (checklist.light !== "normal") light++;
  });

  if (reasonChart) reasonChart.destroy();

  reasonChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["น้ำมันเครื่อง", "น้ำหล่อเย็น", "สภาพยาง", "ไฟแสงสว่าง"],
      datasets: [{
        label: "จำนวนรถ",
        data: [engine, coolant, tire, light],
        backgroundColor: [
          "#dc2626",
          "#0ea5e9",
          "#f97316",
          "#facc15"
        ],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 }
        }
      }
    }
  });
}

const fileInput = document.getElementById("car-images");
const fileInfo = document.getElementById("file-info");

if (fileInput && fileInfo) {
  fileInput.addEventListener("change", () => {
    const count = fileInput.files.length;
    if (count === 0) {
      fileInfo.textContent = "ยังไม่ได้เลือกรูป";
    } else if (count === 1) {
      fileInfo.textContent = fileInput.files[0].name;
    } else {
      fileInfo.textContent = `เลือกรูปแล้ว ${count} รูป`;
    }
  });
}

function showLoading(text = "กำลังดำเนินการ...") {
  const overlay = document.getElementById("loading-overlay");
  const label   = document.getElementById("loading-text");
  if (label) label.textContent = text;
  if (overlay) overlay.style.display = "flex";
}

function hideLoading() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.style.display = "none";
}

function clearHistorySearch() {
  historySearch = "";
  const input = $("history-search");
  if (input) input.value = "";
}

/************************************************************
 * JobClosed
 ************************************************************/
function isJobClosed(item) {
  return !!item.km_end;
}

function lockInspectionFormFully() {
  document.querySelectorAll("input, textarea, button").forEach(el => {
    el.disabled = true;
  });

  // ปุ่มยกเลิกยังกลับได้
  $("cancel-inspection-btn")?.removeAttribute("disabled");
}

function applyJobModeLock() {
  const kmEnd  = $("km-end");
  const imgEnd = document.getElementById("img-end");

  if (jobMode === "open") {
    // 🚚 ออกงาน → ล็อก
    if (kmEnd) {
      kmEnd.value = "";
      kmEnd.readOnly = true;
      kmEnd.classList.add("locked");
    }
    if (imgEnd) {
      imgEnd.value = "";
      imgEnd.disabled = true;
    }
  } else {
    // 🏁 ปิดงาน → ปลดล็อก
    if (kmEnd) {
      kmEnd.readOnly = false;
      kmEnd.classList.remove("locked");
    }
    if (imgEnd) {
      imgEnd.disabled = false;
    }
  }
}

/************************************************************
 * ProfileDate
 ************************************************************/
function updateProfileDate() {
  const el = document.getElementById("profile-date");
  if (!el) return;

  if (!inspections || inspections.length === 0) {
    el.textContent = "-";
    return;
  }

  // หา inspection ล่าสุด
  const latest = inspections
    .filter(i => i.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

  el.textContent = new Date(latest.timestamp).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

/************************************************************
 * INIT
 ************************************************************/
(async function init() {
  try {
    lockUI();
    showLoading("กำลังโหลดข้อมูลจากระบบ…");

    await Promise.all([
      loadVehicles(),
      loadInspections()
    ]);

    dataReady = true;     // ✅ ปลดล็อก logic
    unlockUI();
    updateProfileDate();
    updateDashboard();
    updatePassFailDashboard();
    navigateToScreen("home");

  } catch (err) {
    console.error(err);

    showErrorModal(
      "ไม่สามารถโหลดข้อมูลจากระบบได้<br>กรุณารีเฟรชใหม่"
    );

    dataReady = false;
    lockUI(); // ❌ ล็อกถาวร
  } finally {
    hideLoading();
  }
})();
