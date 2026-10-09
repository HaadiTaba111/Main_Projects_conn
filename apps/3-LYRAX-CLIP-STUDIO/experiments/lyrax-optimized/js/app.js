// js/app.js — Main application bootstrap (optimized with 3D Cube)
import { Project } from './modules/Project.js';
import { MediaController } from './modules/MediaController.js';
import { LineHandler } from './handlers/LineHandler.js';
import { RenderHandler } from './handlers/RenderHandler.js';
import { EventFactory } from './modules/EventFactory.js';
import { PlayerUI } from './ui/PlayerUI.js';
import { EventListUI } from './ui/EventListUI.js';
import { LyricsUI } from './ui/LyricsUI.js';
import { CubeRenderer } from './cube/CubeRenderer.js';
import { ParticleSystem } from './cube/ParticleSystem.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log("🚀 لایراکس نسخه بهینه‌شده با مکعب ۳بعدی آماده است");

  // DOM refs
  const projectNameInput = document.getElementById('projectName');
  const btnLoadProject = document.getElementById('btnLoadProject');
  const btnSaveProject = document.getElementById('btnSaveProject');
  const btnRenderVideo = document.getElementById('btnRenderVideo');
  const fileInput = document.getElementById('fileUploadInput');
  const uploadArea = document.getElementById('uploadArea');
  const uploadedFilesList = document.getElementById('uploadedFilesList');
  const renderEngineSelect = document.getElementById('renderEngineSelect');
  const resolutionSelect = document.getElementById('resolutionSelect');
  const fpsInput = document.getElementById('fpsInput');
  const bgColorInput = document.getElementById('bgColorInput');

  // Initialize 3D Cube + Particles
  const cubeEl = document.getElementById('lyricsCube');
  const cubeRenderer = new CubeRenderer(cubeEl);
  const particleSystem = new ParticleSystem('particleCanvas');

  // Project & Controllers
  let project = new Project(projectNameInput.value.trim() || "my_awesome_clip");

  const mediaController = new MediaController(project, (currentTime) => {
    playerUI.update(currentTime);
  });

  const lineHandler = new LineHandler(project, () => {
    lyricsUI.updateDisplay();
  }, cubeRenderer);

  // UI Components
  const playerUI = new PlayerUI(project, mediaController);
  const eventListUI = new EventListUI(project);
  const lyricsUI = new LyricsUI(lineHandler, mediaController);

  // Timeline subscription
  project.timeline.subscribe((tl) => {
    eventListUI.render();
    playerUI.update(tl.currentTime);
  });

  // Resolution / FPS / Background listeners
  resolutionSelect.addEventListener('change', () => {
    const [w, h] = resolutionSelect.value.split(',').map(Number);
    project.resolution = [w, h];
  });
  fpsInput.addEventListener('change', () => { project.fps = parseInt(fpsInput.value) || 30; });
  bgColorInput.addEventListener('input', () => { project.background = bgColorInput.value; });

  // Load project
  async function loadProjectData(name) {
    try {
      const res = await fetch(`/api/project/${name}`);
      const data = await res.json();
      if (data.status === 'success') {
        project.loadFromDict(data.project);
        projectNameInput.value = project.name;
        if (data.files) updateFilesListUI(data.files);
        eventListUI.render();
        playerUI.update(0);
        // Update cube if lyrics exist
        const lyricsEvents = project.timeline.events.filter(e => e.type === 'lyrics');
        if (lyricsEvents.length > 0) {
          const texts = lyricsEvents.map(e => e.content);
          cubeRenderer.setLines(texts.map((t, i) => ({ text: t, id: i })));
        }
      }
    } catch (e) { console.error("Load project error:", e); }
  }

  // Update file list
  function updateFilesListUI(files) {
    uploadedFilesList.innerHTML = "";
    if (!files || files.length === 0) {
      uploadedFilesList.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:1rem;">فایلی آپلود نشده است</div>`;
      return;
    }
    for (const f of files) {
      const div = document.createElement('div');
      div.className = 'file-item';
      div.innerHTML = `
        <span>${f.name}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="file-badge">${f.type.toUpperCase()}</span>
          <button class="btn btn-primary btn-add-evt" data-name="${f.name}" data-type="${f.type}" style="padding:2px 8px;font-size:0.75rem;">+ تایم‌لاین</button>
        </div>`;
      uploadedFilesList.appendChild(div);
    }
    uploadedFilesList.querySelectorAll('.btn-add-evt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const fname = e.target.dataset.name;
        const ftype = e.target.dataset.type;
        let newEvt;
        if (['mp3','wav'].includes(ftype)) newEvt = EventFactory.createAudioEvent(fname, 30.0);
        else if (['jpg','jpeg','png'].includes(ftype)) newEvt = EventFactory.createImageEvent(fname, 0.0, 5.0);
        else if (ftype === 'mp4') newEvt = EventFactory.createVideoEvent(fname, 0.0, 10.0);
        if (newEvt) project.timeline.addEvent(newEvt);
      });
    });
  }

  // Top bar events
  btnLoadProject.addEventListener('click', () => {
    const name = projectNameInput.value.trim() || "default_project";
    project.name = name;
    loadProjectData(name);
  });

  btnSaveProject.addEventListener('click', () => {
    project.name = projectNameInput.value.trim() || "default_project";
    RenderHandler.saveProject(project);
  });

  btnRenderVideo.addEventListener('click', () => {
    project.name = projectNameInput.value.trim() || "default_project";
    const engine = renderEngineSelect.value;
    RenderHandler.startRender(project, engine);
  });

  // Upload events
  uploadArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const name = projectNameInput.value.trim() || "default_project";
    project.name = name;
    try {
      uploadArea.style.opacity = '0.5';
      const data = await RenderHandler.uploadFiles(name, e.target.files);
      uploadArea.style.opacity = '1';
      if (data.status === 'success') {
        updateFilesListUI(data.files);
        const audioUploaded = data.uploaded.find(f => f.endsWith('.mp3') || f.endsWith('.wav'));
        if (audioUploaded && !project.timeline.events.find(ev => ev.type === 'audio')) {
          project.timeline.addEvent(EventFactory.createAudioEvent(audioUploaded, 30.0));
        }
        alert(`✅ ${data.uploaded.length} فایل با موفقیت آپلود شد.`);
      }
    } catch (err) {
      uploadArea.style.opacity = '1';
      alert("❌ خطا در آپلود فایل‌ها");
    }
  });

  // Drag & drop
  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'var(--lemon)'; });
  uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = 'var(--border-color)'; });
  uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--border-color)';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const name = projectNameInput.value.trim() || "default_project";
      project.name = name;
      try {
        const data = await RenderHandler.uploadFiles(name, e.dataTransfer.files);
        if (data.status === 'success') updateFilesListUI(data.files);
      } catch (err) { console.error("Drop upload error:", err); }
    }
  });

  // Initial load
  await loadProjectData(project.name);
});
