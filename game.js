// Audio setup with clear feedback sounds
const sounds = {
    hit: new Howl({
        src: ['https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'], // Regular hit sound
        volume: 0.4,
        rate: 1.2 // Slightly faster for snappier feedback
    }),
    miss: new Howl({
        src: ['https://assets.mixkit.co/active_storage/sfx/2947/2947-preview.mp3'], // Miss sound
        volume: 0.3
    }),
    perfect: new Howl({
        src: ['https://assets.mixkit.co/active_storage/sfx/1434/1434-preview.mp3'], // Perfect hit sound
        volume: 0.5
    })
};

// Three.js setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Player movement variables
const moveSpeed = 0.15;
const player = {
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    onGround: true,
    canJump: true
};

// Movement controls state
const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false
};

// Mouse control variables
const sensitivity = 0.0015; // Reduced slightly for more stability
let isPointerLocked = false;
let verticalRotation = 0;

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(0, 0, 1);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// Room setup
const roomGeometry = new THREE.BoxGeometry(30, 20, 30);
const roomMaterial = new THREE.MeshPhongMaterial({ color: 0x808080, side: THREE.BackSide });
const room = new THREE.Mesh(roomGeometry, roomMaterial);
scene.add(room);

// Target wall setup
const wallGeometry = new THREE.PlaneGeometry(20, 15);
const wallMaterial = new THREE.MeshPhongMaterial({ color: 0x606060 });
const wall = new THREE.Mesh(wallGeometry, wallMaterial);
wall.position.z = -14;
scene.add(wall);

// Initial camera position
camera.position.y = 2;
camera.position.z = 10;

// Target spheres array
let targets = [];
let score = 0;

// Add these variables at the top with your other state variables
let isPaused = false;
let baseSensitivity = 0.002;
let sensitivityMultiplier = 1.0;
const MAX_LEADERBOARD_ENTRIES = 10;
const GAME_DURATION = 60; // Game duration in seconds
let gameTimer = null;
let timeRemaining;
let isGameActive = false;

// Leaderboard management
const leaderboard = {
    scores: [],
    
    init() {
        const saved = localStorage.getItem('aimTrainerLeaderboard');
        this.scores = saved ? JSON.parse(saved) : [];
    },
    
    add(name, score) {
        this.scores.push({ name, score, date: Date.now() });
        this.scores.sort((a, b) => b.score - a.score);
        if (this.scores.length > MAX_LEADERBOARD_ENTRIES) {
            this.scores.pop();
        }
        localStorage.setItem('aimTrainerLeaderboard', JSON.stringify(this.scores));
        this.display();
    },
    
    isHighScore(score) {
        return this.scores.length < MAX_LEADERBOARD_ENTRIES || score > this.scores[this.scores.length - 1].score;
    },
    
    display() {
        const leaderboardList = document.getElementById('leaderboardList');
        leaderboardList.innerHTML = '';
        
        this.scores.forEach((entry, index) => {
            const scoreEntry = document.createElement('div');
            scoreEntry.className = 'score-entry';
            scoreEntry.innerHTML = `
                <span>${index + 1}. ${entry.name}</span>
                <span>${entry.score}</span>
            `;
            leaderboardList.appendChild(scoreEntry);
        });
    }
};

function spawnTarget() {
    const radius = 0.3;
    const geometry = new THREE.SphereGeometry(radius);
    const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const sphere = new THREE.Mesh(geometry, material);
    
    // Random position on wall
    sphere.position.x = (Math.random() - 0.5) * 18;
    sphere.position.y = (Math.random() - 0.5) * 13 + 2;
    sphere.position.z = -13.7; // Slightly in front of wall
    
    scene.add(sphere);
    targets.push(sphere);
    
    setTimeout(() => {
        if (scene.getObjectById(sphere.id)) {
            scene.remove(sphere);
            targets = targets.filter(target => target.id !== sphere.id);
        }
    }, 2000);
}

// Updated mouse movement handler
function onMouseMove(event) {
    if (!isPointerLocked || isPaused) return;

    // Get mouse movement with better precision handling
    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    // Apply smoothing to large movements
    const smoothX = Math.sign(movementX) * Math.min(Math.abs(movementX), 50);
    const smoothY = Math.sign(movementY) * Math.min(Math.abs(movementY), 50);

    // Update camera rotation
    cameraHolder.rotation.y -= smoothX * sensitivity;

    // Update vertical rotation with clamping
    verticalRotation = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, 
        verticalRotation - (smoothY * sensitivity)
    ));
    
    camera.rotation.x = verticalRotation;

    // Ensure rotation values stay within bounds
    cameraHolder.rotation.y = ((cameraHolder.rotation.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

// Set up camera parent for proper rotation
const cameraHolder = new THREE.Object3D();
scene.add(cameraHolder);
cameraHolder.add(camera);
camera.position.set(0, 2, 0); // Set camera height

// Add hit marker animation
function createHitMarker(position) {
    const hitMarkerGeometry = new THREE.RingGeometry(0.2, 0.3, 4);
    const hitMarkerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffffff,
        transparent: true,
        opacity: 1
    });
    const hitMarker = new THREE.Mesh(hitMarkerGeometry, hitMarkerMaterial);
    
    hitMarker.position.copy(position);
    hitMarker.lookAt(camera.position);
    scene.add(hitMarker);

    // Animate and remove hit marker
    const startTime = Date.now();
    function animateHitMarker() {
        const elapsed = Date.now() - startTime;
        if (elapsed > 500) {
            scene.remove(hitMarker);
            return;
        }
        
        hitMarker.scale.setScalar(1 + elapsed/500);
        hitMarkerMaterial.opacity = 1 - (elapsed/500);
        requestAnimationFrame(animateHitMarker);
    }
    animateHitMarker();
}

// Add these variables to your existing ones
let currentStreak = 0;
let lastHitTime = 0;
const STREAK_TIMEOUT = 1500; // 1.5 seconds to maintain streak

// Updated click handler with audio
function onClick() {
    if (!isPointerLocked || !isGameActive) return;
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    const intersects = raycaster.intersectObjects(targets);
    
    if (intersects.length > 0) {
        const target = intersects[0].object;
        const hitPosition = intersects[0].point;
        
        // Calculate distance from center for perfect hit detection
        const distanceFromCenter = new THREE.Vector2(
            hitPosition.x - target.position.x,
            hitPosition.y - target.position.y
        ).length();
        
        // Remove target and update score
        scene.remove(target);
        targets = targets.filter(t => t.id !== target.id);
        score++;
        updateScore(score);
        
        // Play appropriate sound based on accuracy
        if (distanceFromCenter < 0.1) {
            sounds.perfect.play();
            showHitText('PERFECT!', '#ff0000');
        } else {
            sounds.hit.play();
            showHitText('HIT!', '#ffffff');
        }
        
        // Create hit effect
        createHitMarker(hitPosition);
    } else {
        // Miss handling
        sounds.miss.play();
        showHitText('MISS', '#888888');
    }
}

// Add hit text feedback
function showHitText(text, color) {
    const hitText = document.getElementById('hitText') || createHitTextElement();
    hitText.textContent = text;
    hitText.style.color = color;
    hitText.style.opacity = '1';
    hitText.style.transform = 'scale(1.2)';
    
    // Reset after animation
    setTimeout(() => {
        hitText.style.opacity = '0';
        hitText.style.transform = 'scale(1)';
    }, 100);
}

// Create hit text element if it doesn't exist
function createHitTextElement() {
    const hitText = document.createElement('div');
    hitText.id = 'hitText';
    hitText.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: Arial, sans-serif;
        font-size: 24px;
        font-weight: bold;
        transition: all 0.1s ease;
        pointer-events: none;
        z-index: 1000;
        opacity: 0;
    `;
    document.body.appendChild(hitText);
    return hitText;
}

// Keyboard controls
function onKeyDown(event) {
    if (event.code === 'Escape') {
        if (!isPaused) {
            togglePause(true);
        }
        return;
    }
    
    if (isPaused) return;
    
    switch (event.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Space': keys.space = true; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyD': keys.d = false; break;
        case 'Space': keys.space = false; break;
    }
}

// Fullscreen handler
document.getElementById('fullscreenBtn').addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

// Window resize handler
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Event listeners
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('click', onClick);
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);
window.addEventListener('resize', onWindowResize);

// Spawn targets periodically
setInterval(spawnTarget, 1000);

// Updated movement update function
function updateMovement() {
    if (!isPointerLocked) return;
    
    const moveSpeed = 0.15;
    const movement = new THREE.Vector3(0, 0, 0);
    
    // Get forward direction from camera parent (horizontal only)
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraHolder.rotation.y);
    
    // Get right direction from camera parent
    const right = new THREE.Vector3(1, 0, 0);
    right.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraHolder.rotation.y);
    
    // Apply movement based on keys
    if (keys.w) movement.add(forward.multiplyScalar(moveSpeed));
    if (keys.s) movement.sub(forward.multiplyScalar(moveSpeed));
    if (keys.a) movement.sub(right.multiplyScalar(moveSpeed));
    if (keys.d) movement.add(right.multiplyScalar(moveSpeed));
    
    // Update position of camera holder
    cameraHolder.position.add(movement);
    
    // Apply room boundaries to camera holder
    cameraHolder.position.x = Math.max(-14, Math.min(14, cameraHolder.position.x));
    cameraHolder.position.z = Math.max(-13, Math.min(13, cameraHolder.position.z));
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    if (!isPaused) {
        updateMovement();
        renderer.render(scene, camera);
    }
}
animate();

// Add particle effect for hits
function createHitEffect(position, color) {
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    
    for (let i = 0; i < particleCount; i++) {
        // Random position around hit point
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z;
        
        // Random velocity
        velocities.push(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
        );
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: color,
        size: 0.05,
        transparent: true
    });
    
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);
    
    // Animate particles
    const startTime = Date.now();
    function animateParticles() {
        const elapsed = Date.now() - startTime;
        if (elapsed > 500) {
            scene.remove(particles);
            return;
        }
        
        const positions = particles.geometry.attributes.position.array;
        
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] += velocities[i * 3];
            positions[i * 3 + 1] += velocities[i * 3 + 1];
            positions[i * 3 + 2] += velocities[i * 3 + 2];
        }
        
        particles.geometry.attributes.position.needsUpdate = true;
        material.opacity = 1 - (elapsed/500);
        
        requestAnimationFrame(animateParticles);
    }
    animateParticles();
}

// Add pause menu functionality
function togglePause(forcePause = null) {
    isPaused = forcePause !== null ? forcePause : !isPaused;
    const pauseMenu = document.getElementById('pauseMenu');
    
    if (isPaused) {
        pauseMenu.style.display = 'flex';
        document.exitPointerLock();
        if (gameTimer) {
            clearInterval(gameTimer);
            gameTimer = null;
        }
    } else {
        pauseMenu.style.display = 'none';
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        if (!gameTimer && isGameActive) {
            gameTimer = setInterval(updateTimer, 1000);
        }
    }
}

// Make sure pointer lock is handled properly
document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
    if (!isPointerLocked && !isPaused) {
        togglePause(true);
    }
});

// Ensure clean pointer lock acquisition
renderer.domElement.addEventListener('click', () => {
    if (!isPointerLocked && !isPaused) {
        renderer.domElement.requestPointerLock();
    }
});

// Add pause menu event listeners
document.addEventListener('DOMContentLoaded', () => {
    const resumeBtn = document.getElementById('resumeBtn');
    const sensitivitySlider = document.getElementById('sensitivity');
    const sensValue = document.getElementById('sensValue');
    const restartBtn = document.getElementById('restartBtn');
    
    resumeBtn.addEventListener('click', () => {
        togglePause(false);
        renderer.domElement.requestPointerLock();
    });
    
    sensitivitySlider.addEventListener('input', (e) => {
        sensitivityMultiplier = parseFloat(e.target.value);
        sensValue.textContent = sensitivityMultiplier.toFixed(1);
    });
    
    restartBtn.addEventListener('click', () => {
        togglePause(false);
        startGame();
        renderer.domElement.requestPointerLock();
    });
    
    leaderboard.init();
    leaderboard.display();
    
    document.getElementById('submitScore').addEventListener('click', () => {
        const nameInput = document.getElementById('playerName');
        const name = nameInput.value.trim() || 'Anonymous';
        leaderboard.add(name, score);
        document.getElementById('gameOverModal').style.display = 'none';
    });
    
    document.getElementById('playAgain').addEventListener('click', () => {
        document.getElementById('gameOverModal').style.display = 'none';
        startGame();
        renderer.domElement.requestPointerLock();
    });
    
    addVolumeControls();
});

// Initialize game timer
function startGame() {
    isGameActive = true;
    score = 0;
    timeRemaining = GAME_DURATION;
    updateScore(score);
    
    // Clear any existing timer before starting a new one
    if (gameTimer) {
        clearInterval(gameTimer);
    }
    gameTimer = setInterval(updateTimer, 1000);
    updateTimer(); // Initial timer display
}

function updateTimer() {
    if (timeRemaining <= 0) {
        endGame();
        return;
    }
    
    const timerElement = document.getElementById('timer');
    if (timerElement) {
        timerElement.textContent = timeRemaining;
    }
    timeRemaining--;
}

function endGame() {
    isGameActive = false;
    clearInterval(gameTimer);
    document.exitPointerLock();
    
    const finalScore = score;
    document.getElementById('finalScore').textContent = finalScore;
    
    if (leaderboard.isHighScore(finalScore)) {
        document.getElementById('newHighScore').style.display = 'block';
    } else {
        document.getElementById('newHighScore').style.display = 'none';
    }
    
    document.getElementById('gameOverModal').style.display = 'flex';
}

// Create score popup
function createScorePopup(x, y, streak) {
    const popup = document.createElement('div');
    popup.className = 'score-popup';
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    
    let points = 100;
    if (streak > 1) {
        points *= streak;
        popup.style.color = '#ff4655';
    }
    
    popup.textContent = `+${points}`;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 500);
}

// Update streak counter
function updateStreak() {
    const streakCounter = document.getElementById('streakCounter');
    const streakNumber = streakCounter.querySelector('.streak-number');
    
    if (currentStreak > 1) {
        streakCounter.classList.add('active');
        streakNumber.textContent = currentStreak;
    } else {
        streakCounter.classList.remove('active');
    }
}

// Add dynamic crosshair expansion on shot
function expandCrosshair() {
    const lines = document.querySelectorAll('.line');
    lines.forEach(line => {
        line.style.transition = 'transform 0.1s ease-out';
        if (line.classList.contains('line-top')) line.style.transform = 'translateX(-50%) translateY(-2px)';
        if (line.classList.contains('line-bottom')) line.style.transform = 'translateX(-50%) translateY(2px)';
        if (line.classList.contains('line-left')) line.style.transform = 'translateY(-50%) translateX(-2px)';
        if (line.classList.contains('line-right')) line.style.transform = 'translateY(-50%) translateX(2px)';
        
        setTimeout(() => {
            line.style.transform = '';
        }, 100);
    });
}

// Call this when shooting
document.addEventListener('click', () => {
    if (isPointerLocked && isGameActive) {
        expandCrosshair();
    }
});

// Update score function
function updateScore(newScore) {
    const scoreElement = document.getElementById('score');
    if (scoreElement) {
        scoreElement.textContent = newScore;
    }
}

// Add volume controls to the pause menu
function addVolumeControls() {
    const pauseMenu = document.querySelector('.menu-content');
    
    const volumeControl = document.createElement('div');
    volumeControl.className = 'volume-control';
    volumeControl.innerHTML = `
        <div class="sensitivity-control">
            <label for="volume">Sound Volume: <span id="volumeValue">100%</span></label>
            <input type="range" id="volume" min="0" max="100" step="1" value="100">
        </div>
    `;
    
    pauseMenu.appendChild(volumeControl);
    
    // Volume slider functionality
    const volumeSlider = document.getElementById('volume');
    const volumeValue = document.getElementById('volumeValue');
    
    volumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        volumeValue.textContent = `${e.target.value}%`;
        
        // Update all sound volumes
        Object.values(sounds).forEach(sound => {
            sound.volume(volume);
        });
    });
}

// Optional: Add sound preloading
function preloadSounds() {
    Object.values(sounds).forEach(sound => {
        sound.load();
    });
}

// Call this when the game starts
preloadSounds(); 