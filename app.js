const CONFIG = {
    combo: [25, 40, 30, 'Tope'], // The secret combination, will be updated from backend
    apiUrl: 'https://script.google.com/macros/s/AKfycbwj-VqAg3fYXsykmOakby6_f7LFqLUjMzlFq-1-_ExOueeVvHeccSr-4jrxdJRfKlmfwA/exec',
    scoreTable: {
        25: 10,
        26: 9.9,
        27: 9.8,
        28: 9.7,
        29: 9.6,
        30: 9.5,
        31: 9.4,
        32: 9.3,
        33: 9.2,
        34: 9.1,
        35: 9.0,
        36: 8.9,
        37: 8.8,
        38: 8.7,
        39: 8.6,
        40: 8.5
    }
};

// UI Elements
const els = {
    screens: document.querySelectorAll('.screen'),
    start: document.getElementById('screen-start'),
    login: document.getElementById('screen-login'),
    simulator: document.getElementById('screen-simulator'),
    
    // Login
    btnLogin: document.getElementById('btn-login-submit'),
    btnBack: document.getElementById('btn-login-back'),
    loginId: document.getElementById('login-id'),
    loginError: document.getElementById('login-error'),
    
    // Simulator & Dial
    dialKnob: document.getElementById('dial-knob'),
    dialContainer: document.querySelector('.dial-container'),
    dialNumbers: document.getElementById('dial-numbers'),
    displayBox: document.getElementById('dial-display'),
    feedback: document.getElementById('seq-feedback'),
    btnQuit: document.getElementById('btn-quit'),
    btnRestart: document.getElementById('btn-restart'),
    
    // Combo Display
    cVals: [
        document.getElementById('c-val-1'),
        document.getElementById('c-val-2'),
        document.getElementById('c-val-3'),
        document.getElementById('c-val-4')
    ],
    
    // Auth & Dashboard
    dashboard: document.getElementById('dashboard'),
    loading: document.getElementById('loading'),
    userName: document.getElementById('user-name'),
    userId: document.getElementById('user-id'),
    attempts: document.getElementById('attempts-val'),
    level: document.getElementById('level-val'),
    avg: document.getElementById('avg-val'),
    chrono: document.getElementById('chrono-display'),
    toggleTimer: document.getElementById('toggle-timer-btn'),
    
    // Tour
    tourOverlay: document.getElementById('tour-overlay'),
    tourTitle: document.getElementById('tour-title'),
    tourText: document.getElementById('tour-text'),
    tourDots: document.querySelectorAll('.tour-progress .dot'),
    btnTourNext: document.getElementById('btn-tour-next'),
    btnTourSkip: document.getElementById('btn-tour-skip'),
};

// App State
const state = {
    mode: null, // 'training' | 'certification'
    user: null,
    
    // Inputs Control
    inputMode: 'mouse', // 'mouse' | 'touch' | 'sensor'
    sensorActive: false,
    lastSensorAngleDeg: null,
    
    // Timer
    startTime: 0,
    timerInt: null,
    timerRunning: false,
    timerHidden: false,
    elapsedMs: 0,
    
    // Dial state
    currentAngle: 0,
    currentNumber: 0,
    lastNumber: 0,
    
    // Mechanism Logic
    step: 0,
    passes: 0,
    lastDirection: null, // 'L' (CCW) | 'R' (CW)
    isRotating: false,
};

// --- Sequence Logic ---
// 4L (pass 3, stop 4), 3R (pass 2, stop 3), 2L (pass 1, stop 2), 1R (stop/Tope)
const SEQ_RULES = [
    { dir: 'L', target: CONFIG.combo[0], reqPasses: 3 },
    { dir: 'R', target: CONFIG.combo[1], reqPasses: 2 },
    { dir: 'L', target: CONFIG.combo[2], reqPasses: 1 },
    { dir: 'R', target: CONFIG.combo[3], reqPasses: 0 }
];

function initCombo(comboArr) {
    CONFIG.combo = comboArr;
    
    // Update UI
    els.cVals.forEach((el, index) => {
        el.textContent = comboArr[index];
    });
    
    // Update rules
    SEQ_RULES[0].target = comboArr[0];
    SEQ_RULES[1].target = comboArr[1];
    SEQ_RULES[2].target = comboArr[2];
    SEQ_RULES[3].target = comboArr[3];
}

// Generate Dial Interface
function generateDialMarks() {
    const radius = 135; // px from center
    for (let i = 0; i < 100; i++) {
        const angle = i * 3.6; // 360 / 100
        
        if (i % 10 === 0) {
            // Number
            const numEl = document.createElement('div');
            numEl.className = 'dial-number';
            numEl.textContent = i;
            numEl.style.transform = `translateX(-50%) rotate(${angle}deg) translateY(-${radius}px)`;
            els.dialNumbers.appendChild(numEl);
        } else if (i % 2 === 0) {
            // Tick
            const tickEl = document.createElement('div');
            tickEl.className = 'dial-tick';
            tickEl.style.transform = `translateX(-50%) rotate(${angle}deg) translateY(-${radius - 5}px)`;
            els.dialNumbers.appendChild(tickEl);
        }
    }
}

// Audio Synthesizer for Mechanical Click
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function playClickSound() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

function playSuccessSound() {
    if (!audioCtx) audioCtx = new AudioContext();
    const time = audioCtx.currentTime;
    [440, 554, 659].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.2, time + 0.1);
        gain.gain.linearRampToValueAtTime(0, time + 1.0 + (i*0.2));
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(time); osc.stop(time + 2);
    });
}

function playFailSound() {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.4);
}

// Navigation
function switchScreen(screenId) {
    els.screens.forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
    
    if (screenId === 'screen-simulator') {
        els.dashboard.classList.remove('hidden');
    } else {
        els.dashboard.classList.add('hidden');
    }
}

// Dial Drag Logic
let startAngle = 0;
let startRotation = 0;
let centerX = 0;
let centerY = 0;

function initDial() {
    generateDialMarks();
    
    const knob = els.dialKnob;
    
    knob.addEventListener('pointerdown', (e) => {
        if (state.inputMode === 'sensor') return; // Ignore drag if using sensor
        
        const rect = knob.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
        
        const x = e.clientX - centerX;
        const y = e.clientY - centerY;
        startAngle = Math.atan2(y, x); // Treated as lastAngle
        state.isRotating = true;
        
        knob.setPointerCapture(e.pointerId);
        
        // Start timer on first move in cert mode
        if (state.mode === 'certification' && !state.timerRunning) {
            startTimer();
        }
    });

    knob.addEventListener('pointermove', (e) => {
        if (!state.isRotating || state.inputMode === 'sensor') return;
        
        const x = e.clientX - centerX;
        const y = e.clientY - centerY;
        const angle = Math.atan2(y, x);
        
        let delta = angle - startAngle;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        
        let sensitivity = 1;
        if (state.inputMode === 'mouse') sensitivity = 0.25; // Mucho menos sensible
        else if (state.inputMode === 'touch') sensitivity = 0.7; // Táctil normal-bajo
        
        const degDelta = delta * (180 / Math.PI) * sensitivity;
        
        startAngle = angle; // Actualizar para el siguiente frame
        let newAngle = state.currentAngle + degDelta;
        
        updateDial(newAngle);
    });

    knob.addEventListener('pointerup', () => {
        state.isRotating = false;
        els.displayBox.classList.remove('highlight');
    });
}

function updateDial(angle) {
    state.currentAngle = angle;
    els.dialKnob.style.transform = `rotate(${angle}deg)`;
    document.getElementById('dial-numbers').style.transform = `rotate(${angle}deg)`;
    
    let rawNum = -(angle / 3.6);
    rawNum = (Math.round(rawNum) % 100 + 100) % 100; // Positive mod 100
    
    if (rawNum !== state.currentNumber) {
        // Direction detection
        const diff = rawNum - state.currentNumber;
        let direction = null;
        
        if (diff > 0 && diff < 50 || diff < -50) direction = 'L'; // CCW (numbers increase)
        else direction = 'R'; // CW (numbers decrease)
        
        state.currentNumber = rawNum;
        els.displayBox.textContent = rawNum.toString().padStart(2, '0');
        els.displayBox.classList.add('highlight');
        
        playClickSound();
        checkCombination(rawNum, direction);
    }
}

function resetSequence() {
    state.step = 0;
    state.passes = 0;
    state.lastDirection = null;
    els.feedback.textContent = "Secuencia lista para iniciar (4 Izq)";
    els.feedback.style.color = "var(--light-blue)";
}

function checkCombination(num, dir) {
    if (state.step >= SEQ_RULES.length) return; // Opened
    
    const rule = SEQ_RULES[state.step];
    
    // Check if rule.target is 'Tope', we allow any number when turning in right direction
    const isTargetMatch = num == rule.target || (rule.target.toString().toLowerCase() === 'tope');
    
    // Handle direction change
    if (state.lastDirection && state.lastDirection !== dir) {
        if (state.lastNumber == rule.target && state.passes === rule.reqPasses) {
            // Step completed!
            state.step++;
            state.passes = 0;
            state.lastDirection = dir;
            
            if (state.step >= SEQ_RULES.length) {
                return;
            }
            
            const nextRule = SEQ_RULES[state.step];
            els.feedback.textContent = `Paso ${state.step} completado. Girar a la ${nextRule.dir === 'L'? 'Izquierda':'Derecha'} hacia ${nextRule.target}`;
        } else {
            // Failed sequence
            resetSequence();
            playFailSound();
            els.feedback.textContent = "Secuencia fallida. Reiniciando.";
            els.feedback.style.color = "var(--danger)";
        }
    } else {
        // Continuing same direction
        if (isTargetMatch && dir === rule.dir) {
            state.passes++;
            
            // final opening step (1R and reaches target or Tope)
            if (state.step === 3 && state.passes === 1) { 
                state.step++;
                openSafe();
            }
        }
    }
    
    state.lastDirection = dir;
    state.lastNumber = num;
}

function openSafe() {
    playSuccessSound();
    stopTimer();
    els.feedback.textContent = "¡CAJA ABIERTA!";
    els.feedback.style.color = "var(--success)";
    els.dialContainer.classList.add('glow-success');
    
    setTimeout(() => {
        if (state.mode === 'certification') {
            finishAttempt();
        } else {
            Swal.fire({
                title: '¡Excelente!',
                text: 'Has logrado abrir la caja en el modo entrenamiento.',
                icon: 'success',
                confirmButtonText: 'Volver a jugar',
                confirmButtonColor: '#01326c',
                background: 'rgba(1, 50, 108, 0.9)',
                color: '#fff'
            }).then(() => {
                resetSequence();
                state.currentAngle = 0;
                updateDial(0);
                els.dialContainer.classList.remove('glow-success');
            });
        }
    }, 1500);
}

// Timer Logic
function startTimer() {
    state.startTime = Date.now();
    state.timerRunning = true;
    state.timerInt = setInterval(() => {
        state.elapsedMs = Date.now() - state.startTime;
        if (!state.timerHidden) els.chrono.textContent = formatTime(state.elapsedMs);
    }, 100);
}
function stopTimer() {
    state.timerRunning = false;
    clearInterval(state.timerInt);
}
function formatTime(ms) {
    return (ms / 1000).toFixed(1) + "s";
}

els.toggleTimer.addEventListener('click', () => {
    state.timerHidden = !state.timerHidden;
    els.chrono.style.opacity = state.timerHidden ? '0' : '1';
    els.toggleTimer.textContent = state.timerHidden ? 'Mostrar Tiempo' : 'Ocultar Tiempo';
});

// Scoring
function calculateScore(ms) {
    const s = Math.floor(ms / 1000);
    if (s <= 25) return 10;
    if (s >= 40) return 8.5 - ((s-40)*0.1); 
    return CONFIG.scoreTable[s] || 8.5;
}

function finishAttempt() {
    const score = calculateScore(state.elapsedMs);
    const secs = formatTime(state.elapsedMs);
    
    els.loading.classList.remove('hidden');
    els.loading.querySelector('.loading-text').textContent = 'Guardando calificación...';
    
    fetch(CONFIG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ id: state.user.identificacion, nota: score.toFixed(1) })
    })
    .then(res => res.json())
    .then(data => {
        els.loading.classList.add('hidden');
        if (data.success) {
            Swal.fire({
                title: 'Certificación Finalizada',
                html: `Tiempo: <b>${secs}</b><br>Calificación Obtenida: <b>${score.toFixed(1)}</b>`,
                icon: 'success',
                confirmButtonColor: '#01326c',
                background: 'rgba(1, 50, 108, 0.9)',
                color: '#fff'
            }).then(() => location.reload());
        } else {
            Swal.fire('Error', data.error || 'No se pudo guardar la nota', 'error');
        }
    })
    .catch(err => {
        els.loading.classList.add('hidden');
        Swal.fire('Error de red', 'No se pudo conectar al servidor', 'error');
    });
}

// Auth Login
els.btnLogin.addEventListener('click', () => {
    const id = els.loginId.value.trim();
    if (!id) return;
    
    els.loading.classList.remove('hidden');
    els.loginError.classList.add('hidden');
    
    fetch(`${CONFIG.apiUrl}?id=${encodeURIComponent(id)}`)
        .then(res => res.json())
        .then(data => {
            els.loading.classList.add('hidden');
            if (data.success && data.data) {
                const u = data.data;
                if (u.intentosPendientes <= 0) {
                    els.loginError.textContent = "No tienes intentos pendientes.";
                    els.loginError.classList.remove('hidden');
                    return;
                }
                
                state.user = u;
                if (data.combo) initCombo(data.combo);
                
                // Dashboard
                els.userName.textContent = u.nombre;
                els.userId.textContent = `ID: ${u.identificacion}`;
                els.attempts.textContent = u.intentosPendientes;
                els.level.textContent = u.nivel || '-';
                els.avg.textContent = u.notaPromedio ? parseFloat(u.notaPromedio).toFixed(1) : '-';
                
                switchScreen('screen-simulator');
                Swal.fire({
                    title: '¡Bienvenido!',
                    text: `La evaluación iniciará cuando muevas el dial. Tienes ${u.intentosPendientes} intento(s).`,
                    icon: 'info',
                    confirmButtonColor: '#01326c',
                    background: 'rgba(1, 50, 108, 0.9)',
                    color: '#fff'
                });
            } else {
                els.loginError.textContent = data.error || "Usuario no encontrado.";
                els.loginError.classList.remove('hidden');
            }
        })
        .catch(err => {
            els.loading.classList.add('hidden');
            els.loginError.textContent = "Error de conexión al servidor.";
            els.loginError.classList.remove('hidden');
        });
});

els.btnBack.addEventListener('click', () => {
    switchScreen('screen-start');
    els.loginId.value = '';
    els.loginError.classList.add('hidden');
});

// Main Menu Handlers
document.getElementById('btn-training').addEventListener('click', () => {
    state.mode = 'training';
    els.loading.classList.remove('hidden');
    els.loading.querySelector('.loading-text').textContent = "Cargando...";
    
    fetch(CONFIG.apiUrl).then(res => res.json()).then(data => {
        els.loading.classList.add('hidden');
        if (data.combo) initCombo(data.combo);
        
        switchScreen('screen-simulator');
        document.getElementById('dashboard').style.display = 'none'; // Re-hide dashboard in training
        startTour();
    }).catch(err => {
        // Fallback si falla la red, usar default
        els.loading.classList.add('hidden');
        initCombo(CONFIG.combo);
        switchScreen('screen-simulator');
        document.getElementById('dashboard').style.display = 'none';
        startTour();
    });
});

document.getElementById('btn-certification').addEventListener('click', () => {
    state.mode = 'certification';
    switchScreen('screen-login');
});

// Resets logic without leaving view
els.btnRestart.addEventListener('click', () => {
    if (state.timerRunning) stopTimer();
    state.elapsedMs = 0;
    if (!state.timerHidden) els.chrono.textContent = "00.0s";
    els.dialContainer.classList.remove('glow-success');
    resetSequence();
    state.currentAngle = 0;
    updateDial(0);
});

els.btnQuit.addEventListener('click', () => {
    Swal.fire({
        title: '¿Abandonar?',
        text: state.mode === 'certification' ? "Esto contará como intento fallido." : "Volverás al menú principal.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff4757',
        cancelButtonColor: '#01326c',
        confirmButtonText: 'Sí, salir',
        cancelButtonText: 'Cancelar',
        background: 'rgba(1, 50, 108, 0.9)',
        color: '#fff'
    }).then((result) => {
        if (result.isConfirmed) {
            if (state.mode === 'certification' && state.timerRunning) {
                stopTimer();
                state.elapsedMs = 99000;
                finishAttempt();
            } else {
                location.reload();
            }
        }
    });
});

// Interactive Tour Logic
const tourSteps = [
    { title: "Mecanismo del Dial", text: () => "Este simulador emula una caja fuerte analógica. Gira el dial arrastrándolo en círculo." },
    { title: "4 Izquierda", text: () => `Para empezar, debes girar a la Izquierda (sentido antihorario) hasta el número ${CONFIG.combo[0]}, pasándolo 3 veces enteras y deteniéndote la cuarta vez.` },
    { title: "Siguiente Número", text: () => `Luego, gira a la Derecha hasta el ${CONFIG.combo[1]}, pasándolo 2 veces y deteniéndote a la tercera.` },
    { title: "Apertura Final", text: () => `Continúa según la secuencia visualizada en pantalla. ¡Suerte!` }
];
let currentTourStep = 0;

function startTour() {
    currentTourStep = 0;
    els.tourOverlay.classList.remove('hidden');
    updateTourUI();
}

function updateTourUI() {
    const step = tourSteps[currentTourStep];
    els.tourTitle.textContent = step.title;
    els.tourText.textContent = typeof step.text === 'function' ? step.text() : step.text;
    els.tourDots.forEach((d, i) => {
        d.classList.toggle('active', i === currentTourStep);
    });
    els.btnTourNext.textContent = currentTourStep === tourSteps.length - 1 ? "Comenzar" : "Siguiente";
}

els.btnTourNext.addEventListener('click', () => {
    if (currentTourStep < tourSteps.length - 1) {
        currentTourStep++;
        updateTourUI();
    } else {
        els.tourOverlay.classList.add('hidden');
        resetSequence();
    }
});
els.btnTourSkip.addEventListener('click', () => {
    els.tourOverlay.classList.add('hidden');
    resetSequence();
});

// --- Input Modes & Sensor Logic ---
document.querySelectorAll('input[name="input-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        state.inputMode = e.target.value;
        if (state.inputMode === 'sensor') {
            enableSensor();
        } else {
            disableSensor();
        }
    });
});

function enableSensor() {
    // Si estamos en un dispositivo iOS que requiere permisos
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    startSensorReading();
                } else {
                    Swal.fire('Error', 'Permiso denegado para sensores. Usa Mouse o Táctil.', 'error');
                    document.querySelector('input[value="mouse"]').click();
                    state.inputMode = 'mouse';
                }
            })
            .catch(err => {
                console.error(err);
                Swal.fire('Error', 'No se pudo activar el sensor.', 'error');
            });
    } else {
        startSensorReading();
    }
}

function disableSensor() {
    state.sensorActive = false;
    state.lastSensorAngleDeg = null;
    els.dialContainer.style.borderColor = "";
}

function startSensorReading() {
    state.sensorActive = true;
    state.lastSensorAngleDeg = null;
    els.dialContainer.style.borderColor = "var(--success)"; // feedback visual rápido
    
    Swal.fire({
        title: 'Modo Dial Físico',
        text: 'Coloca el teléfono en vertical (parado) y gíralo como volante.',
        icon: 'info',
        confirmButtonColor: '#01326c',
        background: 'rgba(1, 50, 108, 0.9)',
        color: '#fff'
    });
}

window.addEventListener('deviceorientation', (e) => {
    if (state.inputMode !== 'sensor' || !state.sensorActive) return;
    
    // Cálculo de ángulo basado en gravedad (Volante Vertical)
    // Beta: arriba/abajo, Gamma: izquierda/derecha
    const angleRad = Math.atan2(e.gamma, e.beta);
    let angleDeg = angleRad * (180 / Math.PI);
    
    if (state.lastSensorAngleDeg === null) {
        state.lastSensorAngleDeg = angleDeg;
        
        // Empezar timer en certificación al primer giro con el sensor
        if (state.mode === 'certification' && !state.timerRunning) {
            startTimer();
        }
        return;
    }
    
    let delta = angleDeg - state.lastSensorAngleDeg;
    
    // Normalizar cruce de 180 a -180
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    
    state.lastSensorAngleDeg = angleDeg;
    
    // Acumular giro actual. Multiplicador para balancear con el mundo real
    let newAngle = state.currentAngle + (delta * 1.0); 
    updateDial(newAngle);
});

// Init
window.addEventListener('DOMContentLoaded', () => {
    initDial();
    initCombo(CONFIG.combo); // Init basic layout before fetch finishes
});
