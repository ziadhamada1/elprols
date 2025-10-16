// ==============================
// 🗺️ إنشاء الخريطة الأساسية
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) return console.error("❌ عنصر الخريطة #map غير موجود في الصفحة.");

  const map = L.map("map").setView([31.5, 30.9], 10);

  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(map);

  const sat = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"]
  });

  L.control.layers(
    { "🗺️ خريطة الشوارع": osm, "🛰️ القمر الصناعي": sat },
    {}
  ).addTo(map);

  // دائرة منطقة البرلس
  const borollosCircle = L.circle([31.5, 30.9], {
    radius: 19000,
    color: "#007bff",
    fillColor: "#007bff",
    fillOpacity: 0.2,
    weight: 2
  })
    .addTo(map)
    .bindPopup("<strong>منطقة الدراسة:</strong> بحيرة البرلس");

  let uploadedLayer, chart, allPoints = [];

  // ✅ دالة التحقق من داخل الدائرة
  function isInsideCircle(lat, lon) {
    const center = borollosCircle.getLatLng();
    return map.distance([lat, lon], center) <= borollosCircle.getRadius();
  }

  // ==============================
  // 📦 Toast Notifications
  // ==============================
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.className = `toast ${type}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 50);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ==============================
  // 📁 استقبال الملفات (CSV / GeoJSON)
  // ==============================
  document.getElementById("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const ext = file.name.split(".").pop().toLowerCase();
      let points = [];

      try {
        // CSV parsing
        if (ext === "csv") {
          const rows = text.split("\n").map(r => r.trim()).filter(r => r);
          const headers = rows[0].split(",");
          const latIndex = headers.findIndex(h => /lat/i.test(h));
          const lonIndex = headers.findIndex(h => /lon|lng|long/i.test(h));
          const typeIndex = headers.findIndex(h => /type/i.test(h));
          const notesIndex = headers.findIndex(h => /note|notes/i.test(h));

          if (latIndex === -1 || lonIndex === -1) {
            showToast("❌ الملف لا يحتوي على أعمدة lat و lon", "error");
            return;
          }

          points = rows.slice(1).map(row => {
            const cols = row.split(",");
            return {
              lat: parseFloat(cols[latIndex]),
              lon: parseFloat(cols[lonIndex]),
              type: typeIndex !== -1 ? cols[typeIndex].trim() : "غير محدد",
              props: Object.fromEntries(headers.map((h, i) => [h, cols[i]]))
            };
          }).filter(p => isInsideCircle(p.lat, p.lon));
        }

        // GeoJSON parsing
        else if (ext === "geojson" || ext === "json") {
          const geojson = JSON.parse(text);
          if (!geojson.features) throw new Error("الملف لا يحتوي على Features");

          points = geojson.features
            .filter(f => f.geometry && f.geometry.type === "Point")
            .map(f => ({
              lat: f.geometry.coordinates[1],
              lon: f.geometry.coordinates[0],
              type: f.properties?.type || "غير محدد",
              props: f.properties || {}
            }))
            .filter(p => isInsideCircle(p.lat, p.lon));
        } else {
          showToast("⚠️ صيغة غير مدعومة. استخدم CSV أو GeoJSON فقط.", "warn");
          return;
        }

        if (points.length === 0) {
          showToast("⚠️ لا توجد نقاط داخل منطقة الدراسة.", "warn");
          return;
        }

        allPoints = points;
        drawPoints(points);
        updateDashboard(points);
        fillTable(points);
        showToast(`✅ تم تحميل ${points.length} نقطة بنجاح`, "success");

      } catch (err) {
        console.error(err);
        showToast("❌ حدث خطأ أثناء قراءة الملف", "error");
      }
    };
    reader.readAsText(file);
  });

  // ==============================
  // 🎯 رسم النقاط على الخريطة
  // ==============================
  function drawPoints(points) {
    if (uploadedLayer) map.removeLayer(uploadedLayer);

    uploadedLayer = L.layerGroup(points.map(p => {
      let color = "#9e9e9e";
      const t = p.type.toLowerCase();
      if (t.includes("صناعة")) color = "#e74c3c";
      else if (t.includes("زراعة")) color = "#2ecc71";
      else if (t.includes("سكنية")) color = "#3498db";
      else if (t.includes("صيد")) color = "#00bcd4";

      return L.circleMarker([p.lat, p.lon], {
        radius: 6,
        fillColor: color,
        color: "#fff",
        weight: 1,
        fillOpacity: 0.9
      }).bindPopup(
        Object.entries(p.props)
          .map(([k, v]) => `<strong>${k}</strong>: ${v}`)
          .join("<br>")
      );
    })).addTo(map);

    map.fitBounds(borollosCircle.getBounds());
  }

  // ==============================
  // 📊 تحديث الداشبورد
  // ==============================
  function updateDashboard(points) {
    const typeCounts = {};
    points.forEach(p => {
      const type = p.type || "غير محدد";
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const totalPoints = points.length;
    let html = `
      <h3>📊 تحليل النقاط</h3>
      <p><strong>إجمالي النقاط:</strong> <span style="color:#007bff;">${totalPoints}</span></p>
      <canvas id="typeChart" width="280" height="280"></canvas>
      <ul style="list-style:none;padding:0;margin-top:10px;">
    `;

    for (const [type, count] of Object.entries(typeCounts)) {
      const percent = ((count / totalPoints) * 100).toFixed(1);
      let color = "#9e9e9e";
      const t = type.toLowerCase();
      if (t.includes("صناعة")) color = "#e74c3c";
      else if (t.includes("زراعة")) color = "#2ecc71";
      else if (t.includes("سكنية")) color = "#3498db";
      else if (t.includes("صيد")) color = "#00bcd4";
      html += `
        <li>
          <span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:50%;margin-right:6px;"></span>
          ${type}: ${count} (${percent}%)
        </li>`;
    }
    html += "</ul>";

    document.getElementById("dashboard").innerHTML = html;

    const ctx = document.getElementById("typeChart").getContext("2d");
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "pie",
      data: {
        labels: Object.keys(typeCounts),
        datasets: [{
          data: Object.values(typeCounts),
          backgroundColor: ["#2ecc71", "#3498db", "#e74c3c", "#00bcd4", "#9e9e9e"],
          borderColor: "#fff",
          borderWidth: 2
        }]
      },
      options: { plugins: { legend: { position: "bottom" } } }
    });
  }

  // ==============================
  // 🧾 تعبئة الجدول
  // ==============================
  function fillTable(points) {
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = "";
    points.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.type}</td>
        <td>${p.lat.toFixed(5)}</td>
        <td>${p.lon.toFixed(5)}</td>
        <td>${p.props.notes || ""}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ==============================
  // 🔍 فلترة النقاط
  // ==============================
  document.querySelectorAll("#filter input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", () => {
      const checked = Array.from(document.querySelectorAll("#filter input:checked")).map(c => c.value);
      const filtered = allPoints.filter(p => checked.some(val => p.type.includes(val)));
      drawPoints(filtered);
      updateDashboard(filtered);
      fillTable(filtered);
    });
  });

  // ==============================
  // 🎞️ السلايدرات
  // ==============================
  function initSlider(selector, slideClass) {
    let current = 0;
    const slides = document.querySelectorAll(slideClass);
    if (slides.length === 0) return;
    function show(i) {
      slides.forEach((s, idx) => s.classList.toggle("active", idx === i));
    }
    show(current);
    setInterval(() => {
      current = (current + 1) % slides.length;
      show(current);
    }, 3000);
  }

  initSlider(".product-slider", ".product-slide");
  initSlider(".wildlife-slider", ".wildlife-slide");

  // ==============================
  // 🎚️ تأثير السحب (قبل / بعد)
  // ==============================
  const range = document.getElementById("baRange");
  const afterImg = document.querySelector(".ba-after");
  if (range && afterImg) {
    range.addEventListener("input", () => {
      const value = range.value;
      afterImg.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
    });
  }
});
// ================================
// 📥 زر تصدير التقرير (CSV + PDF)
// ================================

// إنشاء زر في الواجهة
// ✅ تصدير الرسم البياني فقط كـ PDF
document.getElementById('exportPDF').addEventListener('click', async () => {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) {
    alert("⚠️ تأكد من تحميل مكتبة jsPDF أولاً");
    return;
  }

  // نختار العنصر اللي يحتوي على الرسم البياني فقط
  const chartCanvas = document.querySelector('#typeChart');
  if (!chartCanvas) {
    alert("❌ لا يوجد رسم بياني حالياً للتصدير");
    return;
  }

  // نستخدم html2canvas لتحويل الرسم البياني لصورة عالية الجودة
  const canvas = await html2canvas(chartCanvas, { scale: 2 });
  const imgData = canv
  toDataURL("image/png");

  // إنشاء ملف PDF جديد
  const pdf = new jsPDF("p", "mm", "a4");

  // نحسب الأبعاد المناسبة
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 40;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  // إضافة الرسم البياني للملف
  pdf.addImage(imgData, "PNG", 20, 40, imgWidth, imgHeight);
  

  // حفظ الملف باسم مناسب
  pdf.save("الرسم_البياني_البرلس.pdf");
});
// زر تصدير CSV
document.getElementById('exportCSV').addEventListener('click', () => {
  const rows = [
    ['Latitude', 'Longitude', 'Value'],
    [30.9301, 31.2805, 12],
    [30.9352, 31.2850, 15],
    [30.9400, 31.2900, 18],
  ];

  let csvContent = "data:text/csv;charset=utf-8,"
    + rows.map(e => e.join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "data_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});


// ✅ تصدير الرسم البياني فقط كـ PDF
document.getElementById('exportPDF').addEventListener('click', async () => {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) {
    alert("⚠️ تأكد من تحميل مكتبة jsPDF أولاً");
    return;
  }

  const chartCanvas = document.querySelector('#typeChart');
  if (!chartCanvas) {
    alert("❌ لا يوجد رسم بياني حالياً للتصدير");
    return;
  }

  const canvas = await html2canvas(chartCanvas, { scale: 2 });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "mm", "a4");

  const pageWidth = pdf.internal.pageSize.getWidth();
  const imgWidth = pageWidth - 40;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  pdf.addImage(imgData, "PNG", 20, 40, imgWidth, imgHeight);
  pdf.save("الرسم_البياني_البرلس.pdf");
});



// الزر الأول: عرض الخريطة

// نجيب كل الأزرار اللي بتعرض الخريطة
const viewBtns = document.querySelectorAll(".show-map");
const fullscreenImages = document.querySelectorAll(".fullscreenImage");
const closeBtns = document.querySelectorAll(".closeFullscreen");

viewBtns.forEach((btn, index) => {
  btn.addEventListener("click", () => {
    fullscreenImages[index].style.display = "flex"; // تظهر الصورة الكبيرة المقابلة للزر
  });
});

closeBtns.forEach((btn, index) => {
  btn.addEventListener("click", () => {
    fullscreenImages[index].style.display = "none"; // تخفي الصورة عند الضغط على ✖️
  });
});
// لما تدوس على علامة X
closeFullscreen.addEventListener("click", () => {
  fullscreenImage.style.display = "none"; // تختفي الصورة
});

// كمان لو المستخدم ضغط على الخلفية السوداء نفسها، تختفي الصورة
fullscreenImage.addEventListener("click", (e) => {
  if (e.target === fullscreenImage) {
    fullscreenImage.style.display = "none";
  }
});
  

// ========== خلفية تفاعلية (نقاط مترابطة تهرب من الماوس) ==========
const canvas = document.getElementById('bgCanvas');
const ctx = canvas.getContext('2d');
let particles = [];
const numParticles = 80;
const connectDistance = 120;
const mouse = { x: null, y: null, radius: 100 };

function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// إنشاء النقاط
class Particle {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.dx = (Math.random() - 0.5) * 1.2;
    this.dy = (Math.random() - 0.5) * 1.2;
    this.size = Math.random() * 3 + 1;
  }

  update() {
    this.x += this.dx;
    this.y += this.dy;

    // ارتداد من الحواف
    if (this.x < 0 || this.x > canvas.width) this.dx *= -1;
    if (this.y < 0 || this.y > canvas.height) this.dy *= -1;

    // الهروب من الماوس
    const dist = Math.hypot(mouse.x - this.x, mouse.y - this.y);
    if (dist < mouse.radius) {
      const angle = Math.atan2(this.y - mouse.y, this.x - mouse.x);
      const force = (mouse.radius - dist) / mouse.radius;
      this.x += Math.cos(angle) * force * 8;
      this.y += Math.sin(angle) * force * 8;
    }
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }
}

// تحريك الماوس
window.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});

window.addEventListener('mouseleave', () => {
  mouse.x = null;
  mouse.y = null;
});

// ربط النقاط بخطوط
function connectParticles() {
  for (let a = 0; a < particles.length; a++) {
    for (let b = a + 1; b < particles.length; b++) {
      const dx = particles[a].x - particles[b].x;
      const dy = particles[a].y - particles[b].y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < connectDistance) {
        ctx.strokeStyle = `rgba(255,255,255,${1 - distance / connectDistance})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(particles[a].x, particles[a].y);
        ctx.lineTo(particles[b].x, particles[b].y);
        ctx.stroke();
      }
    }
  }
}

// رسم المشهد
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let p of particles) {
    p.update();
    p.draw();
  }
  connectParticles();
  requestAnimationFrame(animate);
}

// تشغيل
particles = Array.from({ length: numParticles }, () => new Particle());
animate();

