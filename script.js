// Silueta oficial SVG en alta resolución
const DEFAULT_AVATAR = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 120' fill='%2394a3b8'%3E%3Cpath d='M50 55a22 22 0 1 0 0-44 22 22 0 0 0 0 44zm0 12c-23 0-42 16-42 36v12h84v-12c0-20-19-36-42-36z'/%3E%3C/svg%3E";

// Insignias de reemplazo locales (sin depender de internet ni de CORS al exportar PDF)
function makePlaceholder(w, h, bg, text) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>` +
    `<rect width='100%' height='100%' fill='${bg}'/>` +
    `<text x='50%' y='50%' fill='#ffffff' font-family='Arial, sans-serif' font-size='20' font-weight='bold' text-anchor='middle' dominant-baseline='middle'>${text}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
const PLACEHOLDER_SCHOOL = makePlaceholder(120, 120, '#1e1b4b', 'ESCUDO');
const PLACEHOLDER_ONPE = makePlaceholder(160, 120, '#0f172a', 'ONPE');

// Datos editables de la mesa de sufragio (se recuerdan en el navegador)
const MESA_DEFAULTS = {
  secMesa: '000001',
  departamento: 'LA LIBERTAD',
  provincia: 'OTUZCO',
  distrito: 'USQUIL - CUYUCHUGO',
  priMesa: '01'
};
let mesaConfig = { ...MESA_DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem('padron-mesa-config') || 'null');
  if (saved) mesaConfig = { ...MESA_DEFAULTS, ...saved };
} catch (e) {}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let mesaRenderTimer = null;
window.updateMesaConfig = function(input) {
  mesaConfig[input.dataset.field] = input.value.toUpperCase();
  try { localStorage.setItem('padron-mesa-config', JSON.stringify(mesaConfig)); } catch (e) {}
  markChanged();
  clearTimeout(mesaRenderTimer);
  mesaRenderTimer = setTimeout(() => {
    renderSecundaria();
    renderPrimaria();
  }, 250);
};

function fillMesaInputs() {
  document.querySelectorAll('.mesa-input').forEach(input => {
    input.value = mesaConfig[input.dataset.field] || '';
  });
}

// -------------------------------------------------------------
// ESTADO: empieza vacío y se guarda automáticamente en este navegador
// -------------------------------------------------------------
const STORAGE_KEY = 'padron-datos-v1';

let logoSchoolImg = null;
let logoOnpeImg = null;
let studentsSecundaria = [];
let studentsPrimaria = [];

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved) {
    studentsSecundaria = Array.isArray(saved.secundaria) ? saved.secundaria : [];
    studentsPrimaria = Array.isArray(saved.primaria) ? saved.primaria : [];
    logoSchoolImg = saved.logoSchool || null;
    logoOnpeImg = saved.logoOnpe || null;
  }
} catch (e) {}

let storageWarningShown = false;
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      secundaria: studentsSecundaria,
      primaria: studentsPrimaria,
      logoSchool: logoSchoolImg,
      logoOnpe: logoOnpeImg
    }));
  } catch (e) {
    if (!storageWarningShown) {
      storageWarningShown = true;
      alert('Aviso: el navegador no tiene más espacio para guardar los datos (posiblemente por las fotos). ' +
            'Usa "Guardar Respaldo" ahora para no perder lo que agregues desde este momento.');
    }
  }
  markChanged();
}

// -------------------------------------------------------------
// RESPALDO: guardar / cargar un archivo para continuar en otra computadora
// -------------------------------------------------------------
const BACKUP_APP_ID = 'padron-electoral-cuyuchugo';
const LAST_CHANGE_KEY = 'padron-ultimo-cambio';
const LAST_BACKUP_KEY = 'padron-ultimo-respaldo';

function readTime(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; }
}
function writeTime(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) {}
}

function markChanged() {
  writeTime(LAST_CHANGE_KEY, Date.now());
  updateBackupStatus();
}

function updateBackupStatus() {
  const el = document.getElementById('backup-status');
  if (!el) return;
  const total = studentsSecundaria.length + studentsPrimaria.length;
  const lastChange = readTime(LAST_CHANGE_KEY);
  const lastBackup = readTime(LAST_BACKUP_KEY);
  if (total === 0) {
    el.textContent = '';
  } else if (lastBackup && lastBackup >= lastChange) {
    el.textContent = '• Respaldo al día';
    el.className = 'font-semibold text-emerald-600';
  } else {
    el.textContent = '• Hay cambios sin respaldar';
    el.className = 'font-semibold text-amber-600';
  }
}

function backupTimestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}`;
}

window.exportBackup = function() {
  const data = {
    app: BACKUP_APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    mesaConfig,
    secundaria: studentsSecundaria,
    primaria: studentsPrimaria,
    logoSchool: logoSchoolImg,
    logoOnpe: logoOnpeImg
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `padron_respaldo_${backupTimestamp()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  writeTime(LAST_BACKUP_KEY, Date.now());
  updateBackupStatus();
};

// Validación estricta: solo se aceptan los campos esperados y con el formato correcto
function cleanText(value, maxLen) {
  return typeof value === 'string' ? value.trim().toUpperCase().slice(0, maxLen) : '';
}
function cleanImage(value) {
  return typeof value === 'string' && /^data:image\/(png|jpeg|webp|gif|svg\+xml);/.test(value) ? value : null;
}
function cleanStudents(list, level) {
  if (!Array.isArray(list)) throw new Error(`la lista de ${level} no es válida`);
  const seen = new Set();
  return list.map((s, i) => {
    const dni = typeof s?.dni === 'string' ? s.dni.trim() : '';
    if (!/^\d{8}$/.test(dni)) throw new Error(`el alumno N° ${i + 1} de ${level} tiene un DNI inválido`);
    if (seen.has(dni)) throw new Error(`el DNI ${dni} está repetido en ${level}`);
    seen.add(dni);
    const student = {
      id: Number.isFinite(s.id) ? s.id : Date.now() + i,
      apellidos: cleanText(s.apellidos, 80),
      nombres: cleanText(s.nombres, 80),
      dni
    };
    if (level === 'secundaria') student.foto = cleanImage(s.foto);
    else student.grado = /^[1-6]° Primaria$/.test(s.grado) ? s.grado : '1° Primaria';
    return student;
  });
}

window.importBackup = function(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || data.app !== BACKUP_APP_ID) {
        throw new Error('el archivo no es un respaldo de este sistema');
      }
      const secundaria = cleanStudents(data.secundaria, 'secundaria');
      const primaria = cleanStudents(data.primaria, 'primaria');

      const fecha = data.exportedAt ? new Date(data.exportedAt).toLocaleString('es-PE') : 'fecha desconocida';
      const current = studentsSecundaria.length + studentsPrimaria.length;
      const msg = `Respaldo del ${fecha}:\n` +
        `• Secundaria: ${secundaria.length} alumnos\n• Primaria: ${primaria.length} alumnos\n\n` +
        (current > 0
          ? `Esto REEMPLAZARÁ los ${current} alumnos que hay ahora en este navegador. ¿Continuar?`
          : '¿Cargar estos datos?');
      if (!confirm(msg)) return;

      studentsSecundaria = secundaria;
      studentsPrimaria = primaria;
      logoSchoolImg = cleanImage(data.logoSchool);
      logoOnpeImg = cleanImage(data.logoOnpe);
      if (data.mesaConfig && typeof data.mesaConfig === 'object') {
        mesaConfig = { ...MESA_DEFAULTS };
        Object.keys(MESA_DEFAULTS).forEach(k => {
          if (typeof data.mesaConfig[k] === 'string') mesaConfig[k] = cleanText(data.mesaConfig[k], 60);
        });
        try { localStorage.setItem('padron-mesa-config', JSON.stringify(mesaConfig)); } catch (e) {}
        fillMesaInputs();
      }

      saveState();
      // Lo cargado coincide con un respaldo existente
      writeTime(LAST_BACKUP_KEY, Date.now());
      updateBackupStatus();
      renderSecundaria();
      renderPrimaria();
      alert('Respaldo cargado correctamente. Puedes continuar donde te quedaste.');
    } catch (err) {
      alert('No se pudo cargar el respaldo: ' + err.message + '.');
    }
  };
  reader.readAsText(file);
};

// Borra todo lo guardado en este navegador (al terminar el proceso electoral o en una PC compartida)
window.deleteAllData = function() {
  if (!confirm('Se borrarán TODOS los datos guardados en este navegador: alumnos de secundaria y primaria, fotos, logos y datos de mesa.\n\n' +
               'Si aún los necesitas, primero usa "Guardar Respaldo".\n\n¿Borrar todo?')) return;
  [STORAGE_KEY, 'padron-mesa-config', LAST_CHANGE_KEY, LAST_BACKUP_KEY].forEach(k => {
    try { localStorage.removeItem(k); } catch (e) {}
  });
  studentsSecundaria = [];
  studentsPrimaria = [];
  logoSchoolImg = null;
  logoOnpeImg = null;
  mesaConfig = { ...MESA_DEFAULTS };
  fillMesaInputs();
  updateBackupStatus();
  renderSecundaria();
  renderPrimaria();
};

// Reduce fotos y logos antes de guardarlos para no llenar el almacenamiento del navegador
function resizeImageFile(file, maxSize, mime) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        if (mime === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(mime, 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Mensaje solo para pantalla cuando la lista está vacía (no sale en PDF ni impresión)
function emptyListNotice(count) {
  if (count > 0) return '';
  return `
    <div class="no-print absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-slate-400 px-10 pointer-events-none">
      <div class="text-sm font-bold">Aún no hay alumnos registrados</div>
      <div class="text-xs mt-1">Usa el formulario de arriba para agregarlos uno por uno.</div>
    </div>
  `;
}

// Nivel activo
window.currentActiveLevel = 'secundaria';

// Función para alternar niveles
window.switchLevel = function(level) {
  window.currentActiveLevel = level;
  const tabSec = document.getElementById('tab-btn-secundaria');
  const tabPri = document.getElementById('tab-btn-primaria');
  const viewSec = document.getElementById('view-secundaria');
  const viewPri = document.getElementById('view-primaria');

  if (!viewSec || !viewPri) return;

  if (level === 'secundaria') {
    viewSec.classList.remove('hidden');
    viewPri.classList.add('hidden');
    if (tabSec && tabPri) {
      tabSec.className = 'tab-btn active px-4 py-1.5 text-xs sm:text-sm font-bold rounded-lg flex items-center gap-1.5 transition bg-white text-indigo-950 shadow';
      tabPri.className = 'tab-btn px-4 py-1.5 text-xs sm:text-sm font-bold rounded-lg flex items-center gap-1.5 transition text-indigo-200 hover:text-white';
    }
    renderSecundaria();
  } else {
    viewSec.classList.add('hidden');
    viewPri.classList.remove('hidden');
    if (tabSec && tabPri) {
      tabPri.className = 'tab-btn active px-4 py-1.5 text-xs sm:text-sm font-bold rounded-lg flex items-center gap-1.5 transition bg-white text-emerald-950 shadow';
      tabSec.className = 'tab-btn px-4 py-1.5 text-xs sm:text-sm font-bold rounded-lg flex items-center gap-1.5 transition text-indigo-200 hover:text-white';
    }
    renderPrimaria();
  }
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
};

// Subida unificada de logotipos
window.handleLogoUpload = function(event, targetType) {
  const file = event.target.files[0];
  if (!file) return;
  resizeImageFile(file, 400, 'image/png').then(dataUrl => {
    if (targetType.includes('school')) {
      logoSchoolImg = dataUrl;
    } else {
      logoOnpeImg = dataUrl;
    }
    saveState();
    renderSecundaria();
    renderPrimaria();
  }).catch(err => console.error(err));
  event.target.value = '';
};

// -------------------------------------------------------------
// RENDERIZADO SECUNDARIA (10 ALUMNOS POR HOJA A4)
// -------------------------------------------------------------
function renderSecCard(student, orderNum) {
  if (!student) {
    return `<div class="onpe-card-row" aria-hidden="true"></div>`;
  }

  const orderStr = String(orderNum).padStart(3, '0');
  const photoSrc = student.foto || DEFAULT_AVATAR;

  return `
    <div class="border-2 border-black flex flex-col bg-white overflow-hidden onpe-card-row relative text-black">
      <!-- Cabecera compacta: N° Orden, DNI y Código de barras -->
      <div class="h-6 min-h-[24px] max-h-[24px] border-b-2 border-black flex items-center justify-between px-2 bg-white">
        <div class="flex items-center gap-2">
          <span class="text-sm font-black tracking-tight leading-none">${orderStr}</span>
          <span class="text-xs font-black tracking-wider leading-none">
            ${escapeHtml(student.dni)}
          </span>
          <span class="text-[7px] font-extrabold uppercase text-slate-500 leading-none">N° DNI</span>
        </div>
        <div class="flex items-center gap-1.5">
          <svg class="barcode-sec-${student.dni} h-4.5"></svg>
          <button onclick="removeStudentSecundaria(${student.id})" class="no-print btn-delete text-rose-500 hover:text-rose-700 p-0.5" title="Eliminar estudiante">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <!-- Cuerpo de la tarjeta: Foto | Nombres, No Votó y Firma | Huella Dactilar -->
      <div class="flex-1 flex overflow-hidden">
        <!-- 1. Foto Carné -->
        <div class="w-[82px] min-w-[82px] max-w-[82px] border-r-2 border-black p-1 bg-slate-50 flex items-center justify-center overflow-hidden">
          <img src="${escapeHtml(photoSrc)}" alt="Foto" class="w-full h-full object-cover grayscale contrast-125 border border-slate-300">
        </div>

        <!-- 2. Centro: Nombres Completos y Casilleros de Sufragio -->
        <div class="flex-1 flex flex-col justify-between p-1.5 overflow-hidden">
          <div>
            <div class="font-black text-[9.5px] uppercase tracking-tight leading-tight line-clamp-2">
              ${escapeHtml(student.apellidos)}, ${escapeHtml(student.nombres)}
            </div>
            <div class="text-[7px] font-bold text-slate-600 tracking-wider uppercase mt-0.5">
              ESTUDIANTE REGULAR
            </div>
          </div>

          <!-- Fila inferior: Sello NO VOTÓ y Espacio Amplio para Firma -->
          <div class="flex items-end gap-1.5 h-9">
            <!-- Cajetín NO VOTÓ -->
            <div class="w-[38px] min-w-[38px] border border-black h-full flex flex-col items-center justify-center bg-white p-0.5">
              <span class="text-[6.5px] font-black uppercase text-center leading-none">NO VOTÓ</span>
              <div class="w-4 h-4 border border-dashed border-slate-400 mt-0.5"></div>
            </div>

            <!-- Casillero Amplio para Firma -->
            <div class="flex-1 border-b border-black h-full flex flex-col justify-end pb-0.5 px-1 bg-white">
              <span class="text-[7.5px] font-bold text-slate-400 uppercase text-right leading-none select-none">FIRMA</span>
            </div>
          </div>
        </div>

        <!-- 3. Casillero Vertical de Huella Dactilar Ampliado -->
        <div class="w-[84px] min-w-[84px] max-w-[84px] border-l-2 border-black p-1 flex flex-col items-center justify-between bg-white">
          <span class="text-[7px] font-black uppercase tracking-wider text-center leading-none mt-0.5">HUELLA DACTILAR</span>
          <div class="w-12 h-14 border border-dashed border-slate-400 rounded-full flex flex-col items-center justify-center my-0.5">
            <i data-lucide="fingerprint" class="w-6 h-6 text-slate-300 stroke-1"></i>
          </div>
          <span class="text-[6px] font-bold text-slate-500 uppercase leading-none">ÍNDICE DERECHO</span>
        </div>
      </div>
    </div>
  `;
}

function renderSecundaria() {
  const container = document.getElementById('secundaria-sheets-container');
  if (!container) return;
  container.innerHTML = '';

  const perPage = 10;
  const totalPages = Math.max(1, Math.ceil(studentsSecundaria.length / perPage));

  const schoolLogoSrc = logoSchoolImg || PLACEHOLDER_SCHOOL;
  const onpeLogoSrc = logoOnpeImg || PLACEHOLDER_ONPE;

  for (let p = 0; p < totalPages; p++) {
    const pageStudents = studentsSecundaria.slice(p * perPage, (p + 1) * perPage);
    const sheet = document.createElement('div');
    sheet.className = 'sheet-a4 shadow-xl border border-slate-300 p-5 flex flex-col justify-between mb-8';

    // 1. Encabezado Oficial ONPE
    const headerHTML = `
      <div class="border-b-2 border-black pb-2 mb-2">
        <div class="flex items-center justify-between">
          <!-- Escudo Colegio -->
          <div class="w-16 h-16 flex items-center justify-center">
            <img src="${schoolLogoSrc}" alt="Escudo I.E." class="max-h-full max-w-full object-contain">
          </div>

          <!-- Membrete Central -->
          <div class="text-center flex-1 px-2">
            <div class="text-[9px] font-bold tracking-widest text-slate-700 uppercase leading-none">ELECCIONES MUNICIPIO ESCOLAR 2026</div>
            <h2 class="text-base font-black tracking-tight uppercase leading-snug mt-0.5">I.E. JOSÉ DE LA TORRE UGARTE - CUYUCHUGO</h2>
            <h1 class="text-lg font-black tracking-wider uppercase leading-none mt-0.5 text-black">LISTA DE ELECTORES</h1>
          </div>

          <!-- Logo ONPE y Número de Página -->
          <div class="flex items-center gap-2">
            <div class="w-16 h-16 flex items-center justify-center">
              <img src="${onpeLogoSrc}" alt="Logo ONPE" class="max-h-full max-w-full object-contain">
            </div>
            <div class="border-2 border-black px-2.5 py-1 text-center font-black text-sm bg-white">
              ${p + 1}a
            </div>
          </div>
        </div>

        <!-- Fila de Metadatos de Mesa -->
        <div class="grid grid-cols-12 gap-1.5 mt-2 text-[9px] font-bold uppercase">
          <div class="col-span-3 border border-black px-2 py-1">
            <span class="text-[7px] text-slate-500 block leading-tight">MESA DE SUFRAGIO N°</span>
            <span class="block text-xs font-black leading-tight tracking-wider">${escapeHtml(mesaConfig.secMesa)}</span>
          </div>
          <div class="col-span-3 border border-black px-2 py-1">
            <span class="text-[7px] text-slate-500 block leading-tight">DEPARTAMENTO</span>
            <span class="block leading-tight">${escapeHtml(mesaConfig.departamento)}</span>
          </div>
          <div class="col-span-3 border border-black px-2 py-1">
            <span class="text-[7px] text-slate-500 block leading-tight">PROVINCIA</span>
            <span class="block leading-tight">${escapeHtml(mesaConfig.provincia)}</span>
          </div>
          <div class="col-span-3 border border-black px-2 py-1">
            <span class="text-[7px] text-slate-500 block leading-tight">DISTRITO / CASERÍO</span>
            <span class="block leading-tight">${escapeHtml(mesaConfig.distrito)}</span>
          </div>
        </div>
      </div>
    `;

    // 2. Grilla de 10 Fichas de Electores (2 Columnas x 5 Filas)
    let leftColHTML = '';
    let rightColHTML = '';

    for (let i = 0; i < 5; i++) {
      const studentLeft = pageStudents[i];
      const orderLeft = (p * perPage) + i + 1;
      leftColHTML += renderSecCard(studentLeft, orderLeft);

      const studentRight = pageStudents[i + 5];
      const orderRight = (p * perPage) + i + 6;
      rightColHTML += renderSecCard(studentRight, orderRight);
    }

    const gridHTML = `
      <div class="grid grid-cols-2 gap-2 flex-1 min-h-0 my-1">
        <div class="flex flex-col gap-2">
          ${leftColHTML}
        </div>
        <div class="flex flex-col gap-2">
          ${rightColHTML}
        </div>
      </div>
    `;

    // 3. Pie de Página Oficial
    const footerHTML = `
      <div class="border-t border-black pt-1.5 mt-2 flex items-center justify-between text-[8px] font-bold text-slate-600 uppercase">
        <span>Comité Electoral Estudiantil • I.E. José de la Torre Ugarte - Cuyuchugo</span>
        <span class="font-black text-black">Total Electores Hábiles: ${studentsSecundaria.length}</span>
        <span>Elecciones 2026 • Pág. ${p + 1}a de ${totalPages}a</span>
      </div>
    `;

    sheet.innerHTML = headerHTML + gridHTML + footerHTML + emptyListNotice(studentsSecundaria.length);
    container.appendChild(sheet);

    // Generar Códigos de Barras con JsBarcode
    pageStudents.forEach(s => {
      if (!s) return;
      const barcodeElements = sheet.querySelectorAll(`.barcode-sec-${s.dni}`);
      barcodeElements.forEach(el => {
        try {
          JsBarcode(el, s.dni, {
            format: "CODE128",
            width: 1.15,
            height: 18,
            displayValue: false,
            margin: 0
          });
        } catch (err) {
          console.error(err);
        }
      });
    });
  }

  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

// -------------------------------------------------------------
// RENDERIZADO PRIMARIA (10 ALUMNOS POR HOJA A4 TABULAR)
// -------------------------------------------------------------
function renderPrimaria() {
  const container = document.getElementById('primaria-sheets-container');
  if (!container) return;
  container.innerHTML = '';

  const perPage = 10;
  const totalPages = Math.max(1, Math.ceil(studentsPrimaria.length / perPage));

  const schoolLogoSrc = logoSchoolImg || PLACEHOLDER_SCHOOL;
  const onpeLogoSrc = logoOnpeImg || PLACEHOLDER_ONPE;

  for (let p = 0; p < totalPages; p++) {
    const pageStudents = studentsPrimaria.slice(p * perPage, (p + 1) * perPage);
    const sheet = document.createElement('div');
    sheet.className = 'sheet-a4 shadow-xl border border-slate-300 p-5 flex flex-col justify-between mb-8';

    // 1. Encabezado Oficial Primaria
    const headerHTML = `
      <div class="border-b-2 border-black pb-2 mb-2">
        <div class="flex items-center justify-between">
          <div class="w-16 h-16 flex items-center justify-center">
            <img src="${schoolLogoSrc}" alt="Escudo I.E." class="max-h-full max-w-full object-contain">
          </div>

          <div class="text-center flex-1 px-2">
            <div class="text-[9px] font-bold tracking-widest text-slate-700 uppercase leading-none">REPÚBLICA DEL PERÚ • SECTOR EDUCACIÓN</div>
            <h2 class="text-base font-black tracking-tight uppercase leading-snug mt-0.5">I.E. CUYUCHUGO - USQUIL</h2>
            <div class="inline-block bg-black text-white text-xs font-black px-3 py-1 leading-tight tracking-wider uppercase mt-1">
              PADRÓN ELECTORAL ESCOLAR - NIVEL PRIMARIA
            </div>
          </div>

          <div class="w-16 h-16 flex items-center justify-center">
            <img src="${onpeLogoSrc}" alt="Logo ONPE" class="max-h-full max-w-full object-contain">
          </div>
        </div>

        <div class="grid grid-cols-12 gap-1.5 mt-2 text-[9px] font-bold uppercase">
          <div class="col-span-4 border border-black px-2 py-1">
            <span class="text-[7px] text-slate-500 block leading-tight">MESA DE SUFRAGIO N°</span>
            <span class="block text-xs font-black leading-tight">MESA ${escapeHtml(mesaConfig.priMesa)} - PRIMARIA (1° A 6°)</span>
          </div>
          <div class="col-span-5 border border-black px-2 py-1 text-center">
            <span class="text-[7px] text-slate-500 block leading-tight">ELECTORES HÁBILES</span>
            <span class="block font-black text-xs leading-tight">${studentsPrimaria.length} ESTUDIANTES</span>
          </div>
          <div class="col-span-3 border border-black px-2 py-1 text-right">
            <span class="text-[7px] text-slate-500 block leading-tight">PAGINACIÓN</span>
            <span class="block font-black text-xs leading-tight">HOJA ${p + 1} DE ${totalPages}</span>
          </div>
        </div>
      </div>
    `;

    // 2. Tabla Tabular con 10 Filas Altas (~21.5mm)
    let rowsHTML = '';
    // Solo se dibujan filas de alumnos registrados; el resto de la hoja queda en blanco
    for (let r = 0; r < pageStudents.length; r++) {
      const student = pageStudents[r];
      const orderNum = (p * perPage) + r + 1;

      if (student) {
        rowsHTML += `
          <tr class="row-primaria border-b border-black">
            <td class="border border-black p-2 text-center font-black text-sm w-[6%] font-mono">
              ${String(orderNum).padStart(2, '0')}
            </td>
            <td class="border border-black px-3 py-1.5 w-[39%] break-words">
              <div class="font-black text-xs uppercase tracking-tight text-black leading-tight">${escapeHtml(student.apellidos)}</div>
              <div class="font-semibold text-[11px] uppercase tracking-normal text-slate-700 leading-tight mt-0.5">${escapeHtml(student.nombres)}</div>
            </td>
            <td class="border border-black p-2 text-center font-mono font-bold text-sm w-[12%]">
              ${escapeHtml(student.dni)}
            </td>
            <td class="border border-black p-2 text-center font-bold text-xs w-[11%] text-slate-800">
              ${escapeHtml(student.grado)}
            </td>
            <td class="border border-black p-2 w-[19%] relative text-right align-bottom">
              <span class="text-[7.5px] font-bold text-slate-400 uppercase select-none">FIRMA DEL ALUMNO</span>
            </td>
            <td class="border border-black p-1 w-[13%] text-center align-middle">
              <div class="w-11 h-14 border border-dashed border-slate-600 mx-auto rounded-full flex flex-col items-center justify-center p-0.5">
                <span class="text-[6.5px] font-bold text-slate-500 uppercase leading-none">HUELLA</span>
              </div>
            </td>
            <td class="border border-black p-1 text-center w-8 no-print col-action">
              <button onclick="removeStudentPrimaria(${student.id})" class="btn-delete text-rose-500 hover:text-rose-700 p-1" title="Eliminar estudiante">
                <i data-lucide="trash-2" class="w-3.5 h-3.5 inline"></i>
              </button>
            </td>
          </tr>
        `;
      }
    }

    const tableHTML = `
      <div class="flex-1 min-h-0 my-1">
        <table class="w-full border-collapse border-2 border-black text-left table-fixed">
          <thead>
            <tr class="bg-black text-white uppercase text-[10px] font-black tracking-wider">
              <th class="border border-black p-2 text-center w-[6%]">N°</th>
              <th class="border border-black p-2 w-[39%]">Apellidos y Nombres</th>
              <th class="border border-black p-2 text-center w-[12%]">DNI</th>
              <th class="border border-black p-2 text-center w-[11%]">Grado</th>
              <th class="border border-black p-2 text-center w-[19%]">Firma del Estudiante</th>
              <th class="border border-black p-2 text-center w-[13%]">Huella</th>
              <th class="border border-black p-1 text-center w-8 no-print col-action">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>
      </div>
    `;

    // 3. Pie de Página Primaria
    const footerHTML = `
      <div class="border-t border-black pt-1.5 mt-2 flex items-center justify-between text-[8px] font-bold text-slate-600 uppercase">
        <span>Comité Electoral Estudiantil • Nivel Primaria Cuyuchugo</span>
        <span class="font-black text-black">Mesa de Sufragio ${escapeHtml(mesaConfig.priMesa)}</span>
        <span>Elecciones Municipio Escolar 2026</span>
      </div>
    `;

    sheet.innerHTML = headerHTML + tableHTML + footerHTML + emptyListNotice(studentsPrimaria.length);
    container.appendChild(sheet);
  }

  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

// -------------------------------------------------------------
// GESTIÓN DE ESTUDIANTES
// -------------------------------------------------------------
function isDuplicateDni(list, dni) {
  if (list.some(s => s.dni === dni)) {
    alert(`Ya existe un alumno registrado con el DNI ${dni}.`);
    return true;
  }
  return false;
}

window.addStudentSecundaria = async function(e) {
  e.preventDefault();
  const apellidos = document.getElementById('sec-apellidos').value.trim().toUpperCase();
  const nombres = document.getElementById('sec-nombres').value.trim().toUpperCase();
  const dni = document.getElementById('sec-dni').value.trim();
  const fotoInput = document.getElementById('sec-foto');

  if (isDuplicateDni(studentsSecundaria, dni)) return;

  let foto = null;
  if (fotoInput.files && fotoInput.files[0]) {
    try {
      foto = await resizeImageFile(fotoInput.files[0], 400, 'image/jpeg');
    } catch (err) {
      console.error(err);
    }
  }

  studentsSecundaria.push({ id: Date.now(), apellidos, nombres, dni, foto });
  saveState();

  document.getElementById('sec-apellidos').value = '';
  document.getElementById('sec-nombres').value = '';
  document.getElementById('sec-dni').value = '';
  fotoInput.value = '';
  document.getElementById('sec-apellidos').focus();
  renderSecundaria();
};

window.removeStudentSecundaria = function(id) {
  const student = studentsSecundaria.find(s => s.id === id);
  if (!student || !confirm(`¿Eliminar a ${student.apellidos}, ${student.nombres}?`)) return;
  studentsSecundaria = studentsSecundaria.filter(s => s.id !== id);
  saveState();
  renderSecundaria();
};

window.addStudentPrimaria = function(e) {
  e.preventDefault();
  const apellidos = document.getElementById('pri-apellidos').value.trim().toUpperCase();
  const nombres = document.getElementById('pri-nombres').value.trim().toUpperCase();
  const dni = document.getElementById('pri-dni').value.trim();
  const grado = document.getElementById('pri-grado').value;

  if (isDuplicateDni(studentsPrimaria, dni)) return;

  studentsPrimaria.push({ id: Date.now(), apellidos, nombres, dni, grado });
  saveState();

  document.getElementById('pri-apellidos').value = '';
  document.getElementById('pri-nombres').value = '';
  document.getElementById('pri-dni').value = '';
  document.getElementById('pri-apellidos').focus();
  renderPrimaria();
};

window.removeStudentPrimaria = function(id) {
  const student = studentsPrimaria.find(s => s.id === id);
  if (!student || !confirm(`¿Eliminar a ${student.apellidos}, ${student.nombres}?`)) return;
  studentsPrimaria = studentsPrimaria.filter(s => s.id !== id);
  saveState();
  renderPrimaria();
};

// Vaciar la lista completa para empezar desde cero
window.clearSecundaria = function() {
  if (studentsSecundaria.length === 0) return;
  if (!confirm(`Se eliminarán los ${studentsSecundaria.length} alumnos de SECUNDARIA. Esta acción no se puede deshacer. ¿Continuar?`)) return;
  studentsSecundaria = [];
  saveState();
  renderSecundaria();
};

window.clearPrimaria = function() {
  if (studentsPrimaria.length === 0) return;
  if (!confirm(`Se eliminarán los ${studentsPrimaria.length} alumnos de PRIMARIA. Esta acción no se puede deshacer. ¿Continuar?`)) return;
  studentsPrimaria = [];
  saveState();
  renderPrimaria();
};

// Carga de prueba de 90 alumnos (reemplaza la lista actual)
const SAMPLE_APELLIDOS = ["GARCÍA", "RODRÍGUEZ", "LÓPEZ", "SÁNCHEZ", "PÉREZ", "GÓMEZ", "DÍAZ", "FLORES", "TORRES", "QUISPE", "RAMÍREZ", "CASTILLO"];
const SAMPLE_NOMBRES = ["CARLOS", "ANA", "LUIS", "MARÍA", "JORGE", "DIANA", "PEDRO", "CARMEN", "MIGUEL", "ROSA", "CÉSAR", "LUCÍA"];

function confirmReplaceWithSample(count) {
  return count === 0 || confirm(`Esto reemplazará los ${count} alumnos actuales por 90 alumnos de prueba. ¿Continuar?`);
}

window.loadSample90Secundaria = function() {
  if (!confirmReplaceWithSample(studentsSecundaria.length)) return;
  studentsSecundaria = [];
  for (let i = 1; i <= 90; i++) {
    studentsSecundaria.push({
      id: i,
      apellidos: `${SAMPLE_APELLIDOS[i % 12]} ${SAMPLE_APELLIDOS[(i + 3) % 12]}`,
      nombres: `${SAMPLE_NOMBRES[i % 12]} ${SAMPLE_NOMBRES[(i + 2) % 12]}`,
      dni: String(40000000 + i * 137).slice(0, 8),
      foto: null
    });
  }
  saveState();
  renderSecundaria();
};

window.loadSample90Primaria = function() {
  if (!confirmReplaceWithSample(studentsPrimaria.length)) return;
  studentsPrimaria = [];
  for (let i = 1; i <= 90; i++) {
    studentsPrimaria.push({
      id: i,
      apellidos: `${SAMPLE_APELLIDOS[i % 12]} ${SAMPLE_APELLIDOS[(i + 3) % 12]}`,
      nombres: `${SAMPLE_NOMBRES[i % 12]} ${SAMPLE_NOMBRES[(i + 2) % 12]}`,
      dni: String(70000000 + i * 149).slice(0, 8),
      grado: `${((i - 1) % 6) + 1}° Primaria`
    });
  }
  saveState();
  renderPrimaria();
};

// -------------------------------------------------------------
// MODAL DE VISTA PREVIA LIMPIA (A4 / PDF)
// -------------------------------------------------------------
window.openModalPreview = function() {
  const modal = document.getElementById('modal-preview');
  const select = document.getElementById('modal-page-select');
  const containerId = window.currentActiveLevel === 'secundaria' ? 'secundaria-sheets-container' : 'primaria-sheets-container';
  const container = document.getElementById(containerId);
  
  if (!container) return;
  const sheets = container.querySelectorAll('.sheet-a4');
  select.innerHTML = '';

  if (sheets.length === 0) return;

  sheets.forEach((sheet, index) => {
    const opt = document.createElement('option');
    opt.value = index;
    opt.textContent = `Hoja ${index + 1} de ${sheets.length}`;
    select.appendChild(opt);
  });

  modal.classList.remove('hidden');
  updateModalPagePreview();
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
};

window.closeModalPreview = function() {
  const modal = document.getElementById('modal-preview');
  if (modal) modal.classList.add('hidden');
};

window.updateModalPagePreview = function() {
  const select = document.getElementById('modal-page-select');
  const pageIndex = parseInt(select.value) || 0;
  const containerId = window.currentActiveLevel === 'secundaria' ? 'secundaria-sheets-container' : 'primaria-sheets-container';
  const container = document.getElementById(containerId);
  if (!container) return;
  const sheets = container.querySelectorAll('.sheet-a4');
  const previewArea = document.getElementById('modal-preview-content');

  if (!sheets[pageIndex] || !previewArea) return;

  // Clonar hoja para renderizado limpio
  const clonedSheet = sheets[pageIndex].cloneNode(true);
  
  // Remover estrictamente botones de eliminación y columnas de acción del clon
  const deleteElements = clonedSheet.querySelectorAll('.btn-delete, .no-print, .col-action');
  deleteElements.forEach(el => el.remove());

  previewArea.innerHTML = '';
  previewArea.appendChild(clonedSheet);

  // Re-generar códigos de barras en el clon si estamos en Secundaria
  if (window.currentActiveLevel === 'secundaria') {
    studentsSecundaria.forEach(s => {
      const barcodes = previewArea.querySelectorAll(`.barcode-sec-${s.dni}`);
      barcodes.forEach(el => {
        try {
          JsBarcode(el, s.dni, {
            format: "CODE128",
            width: 1.15,
            height: 18,
            displayValue: false,
            margin: 0
          });
        } catch(e) {}
      });
    });
  }
};

// -------------------------------------------------------------
// EXPORTACIÓN A PDF (html2canvas + jsPDF)
// -------------------------------------------------------------

// Clases que nunca deben aparecer en el PDF
function isExcludedFromPDF(el) {
  return el.classList && (
    el.classList.contains('no-print') ||
    el.classList.contains('btn-delete') ||
    el.classList.contains('col-action')
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// html2canvas no soporta object-fit ni filtros CSS: se pre-renderiza cada foto
// recortada (cover) y en escala de grises al tamaño exacto de su casillero.
async function bakePhoto(imgEl, scale) {
  const w = imgEl.clientWidth;
  const h = imgEl.clientHeight;
  if (!w || !h) return null;
  try {
    const src = await loadImage(imgEl.src);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ratio = Math.max(canvas.width / src.width, canvas.height / src.height);
    const dw = src.width * ratio;
    const dh = src.height * ratio;
    ctx.filter = 'grayscale(1) contrast(1.25)';
    ctx.drawImage(src, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function renderSheetToCanvas(sheet, scale) {
  const photos = Array.from(sheet.querySelectorAll('img.object-cover'));
  const baked = await Promise.all(photos.map(img => bakePhoto(img, scale)));

  // Corrige el texto desplazado/cortado: Tailwind pone img {display:block} y
  // html2canvas mide la línea base de las fuentes en el documento original con un <img>.
  // Se aplica solo mientras dura la captura (los img dentro de flex no cambian de tamaño).
  const fix = document.createElement('style');
  fix.textContent = 'img { display: inline-block !important; }';
  document.head.appendChild(fix);
  try {
    return await captureSheet(sheet, scale, baked);
  } finally {
    fix.remove();
  }
}

function captureSheet(sheet, scale, baked) {
  return html2canvas(sheet, {
    scale: scale,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    ignoreElements: isExcludedFromPDF,
    onclone: (doc, clonedSheet) => {
      const fix = doc.createElement('style');
      fix.textContent = 'img { display: inline-block !important; }';
      doc.head.appendChild(fix);

      // Hoja limpia y con medidas exactas A4
      clonedSheet.style.boxShadow = 'none';
      clonedSheet.style.border = 'none';
      clonedSheet.style.margin = '0';
      clonedSheet.style.width = '210mm';
      clonedSheet.style.height = '297mm';

      // line-clamp (-webkit-box) se dibuja cortado: se reemplaza por un recorte simple de 2 líneas
      clonedSheet.querySelectorAll('.line-clamp-2').forEach(el => {
        el.classList.remove('line-clamp-2');
        el.style.display = 'block';
        el.style.overflow = 'hidden';
        el.style.maxHeight = '2.6em';
      });

      // Fotos ya recortadas y en escala de grises
      clonedSheet.querySelectorAll('img.object-cover').forEach((img, i) => {
        if (baked[i]) {
          img.src = baked[i];
          img.classList.remove('grayscale', 'contrast-125');
        }
      });

      // Íconos Lucide: fijar el color real del trazo (currentColor no se resuelve en SVG rasterizado)
      const view = doc.defaultView;
      clonedSheet.querySelectorAll('svg.lucide').forEach(svg => {
        svg.setAttribute('stroke', view.getComputedStyle(svg).color);
      });
    }
  });
}

window.downloadPDF = async function(btn) {
  if (!window.jspdf || typeof html2canvas !== 'function') {
    alert('No se pudieron cargar las librerías para generar el PDF. Revisa tu conexión a internet y recarga la página.');
    return;
  }

  const level = window.currentActiveLevel;
  const container = document.getElementById(level === 'secundaria' ? 'secundaria-sheets-container' : 'primaria-sheets-container');
  const sheets = container ? container.querySelectorAll('.sheet-a4') : [];
  if (sheets.length === 0) return;

  // Estado de "cargando" en todos los botones de PDF
  const buttons = document.querySelectorAll('.btn-pdf');
  buttons.forEach(b => {
    b.disabled = true;
    const label = b.querySelector('.btn-label');
    if (label) label.textContent = 'Generando PDF...';
  });

  try {
    // Da tiempo a Tailwind de generar los estilos de lo recién agregado antes de capturar
    await new Promise(resolve => setTimeout(resolve, 300));

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < sheets.length; i++) {
      buttons.forEach(b => {
        const label = b.querySelector('.btn-label');
        if (label) label.textContent = `Generando ${i + 1}/${sheets.length}...`;
      });

      const canvas = await renderSheetToCanvas(sheets[i], 2);

      // La hoja ya mide 210x297mm (con su propio margen interno): ocupa la página completa
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, pageH);
    }

    const fecha = new Date().toISOString().slice(0, 10);
    pdf.save(`Padron_Electoral_${level === 'secundaria' ? 'Secundaria' : 'Primaria'}_${fecha}.pdf`);
  } catch (err) {
    console.error(err);
    alert('Ocurrió un error al generar el PDF: ' + err.message);
  } finally {
    buttons.forEach(b => {
      b.disabled = false;
      const label = b.querySelector('.btn-label');
      if (label) label.textContent = 'Descargar PDF';
    });
  }
};

// Inicialización al cargar la ventana
window.onload = function() {
  fillMesaInputs();
  updateBackupStatus();
  renderSecundaria();
  renderPrimaria();
  if (window.lucide && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }
};
