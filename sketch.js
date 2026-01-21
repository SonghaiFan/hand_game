let handPose;
let video;
let hands = [];
let gameStarted = false;
let gameOver = false;

// Game state constants
const STATE_WAITING = "WAITING";
const STATE_BEAT1 = "BEAT1"; // Dong
const STATE_BEAT2 = "BEAT2"; // Dong
const STATE_ACTION = "ACTION"; // Da
const STATE_RESULT = "RESULT";

let gameState = STATE_WAITING;
let lastBeatTime = 0;
let beatInterval = 400; // ms per beat
let beatCount = 0;

let playerQi = 0;
let aiQi = 0;
let playerAction = "NONE"; // LUCK, ATTACK, DEFENSE
let aiAction = "NONE";
let resultMessage = "";
let winner = ""; // "PLAYER", "AI", or "BOTH"

// Move Dictionary (JSON Configuration)
const MOVES = {
  "LUCK":      { name: "集气", emoji: "✊", cost: 0.0, desc: "+1气" },
  "ATTACK_1":  { name: "单枪", emoji: "👉", cost: 0.5, desc: "攻击" },
  "ATTACK_2":  { name: "双枪", emoji: "🔫", cost: 1.0, desc: "破小防" },
  "DEFENSE_1": { name: "小防", emoji: "🖐️", cost: 0.0, desc: "防单枪" },
  "DEFENSE_2": { name: "大防", emoji: "🙌", cost: 0.5, desc: "全防" },
  "NONE":      { name: "无效", emoji: "😶", cost: 0.0, desc: "" }
};

// Clap detection
let clapThreshold = 100;
let canClapAgain = true; // prevent multiple triggers per clap

// DOM Elements
let playerQiFill, aiQiFill, resultMsg, beats, overlay, overlayTitle, overlayMsg, startBtn, startState, aiImg;
let speedSlider, speedValDisplay;
let modelReady = false;

// Gesture Control State
let isDraggingSpeed = false;
let dragStartX = 0;
let dragStartSpeed = 0;

// Sound Assets
let sndClap, sndLuck, sndAttack0, sndAttack1, sndAttack2;

function preload() {
  handPose = ml5.handPose({ maxHands: 2, flipped: false });
  
  // Load Sounds
  soundFormats('mp3');
  sndClap = loadSound('sound/CLAP');
  sndLuck = loadSound('sound/LUCK');
  sndAttack0 = loadSound('sound/ATTACK_0');
  sndAttack1 = loadSound('sound/ATTACK_1');
  sndAttack2 = loadSound('sound/ATTACK_2');
}

function setup() {
  const container = document.getElementById("game-container");
  
  let canvas = createCanvas(640, 480);
  canvas.parent("game-container");

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  handPose.detectStart(video, gotHands);

  // Initialize DOM references
  playerQiFill = document.getElementById("player-qi-fill");
  aiQiFill = document.getElementById("ai-qi-fill");
  resultMsg = document.getElementById("result-message");
  beats = [
    document.getElementById("beat1"),
    document.getElementById("beat2"),
    document.getElementById("beat3")
  ];
  overlay = document.getElementById("overlay");
  overlayTitle = document.getElementById("overlay-title");
  overlayMsg = document.getElementById("overlay-msg");
  startBtn = document.getElementById("start-btn");
  startState = document.getElementById("start-state");
  // AI Display
  aiImg = document.getElementById("ai-img");
  
  // Speed Slider
  
  // Speed Slider
  speedSlider = document.getElementById("speed-slider");
  speedValDisplay = document.getElementById("speed-val");
  
  if (speedSlider) {
    speedSlider.addEventListener("input", (e) => {
      beatInterval = parseInt(e.target.value);
      if (speedValDisplay) speedValDisplay.innerText = beatInterval;
    });
  }

  startBtn.addEventListener("click", () => {
    userStartAudio();
    startGame();
  });

  textAlign(CENTER, CENTER);
  textSize(32);
  
  setupLegend();
}

function startGame() {
  gameStarted = true;
  gameOver = false;
  playerQi = 0;
  aiQi = 0;
  gameState = STATE_WAITING;
  gameState = STATE_WAITING;
  overlay.classList.add("hidden");
  resultMsg.innerText = "拍手开始回合 / Clap to Start Round";
  updateUIDOM();
}

function gotHands(results) {
  hands = results;
  // Once we get any results, enable the start button
  if (!modelReady) {
    modelReady = true;
    startBtn.disabled = false;
    startBtn.innerText = "点击开始 / START";
  }
}

function draw() {
  background(0);

  if (gameStarted) {
    checkPlayerClap();
  }

  // Draw mirrored video and hand markers
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);

  for (let i = 0; i < hands.length; i++) {
    let hand = hands[i];
    for (let j = 0; j < hand.keypoints.length; j++) {
      let kp = hand.keypoints[j];
      fill(0, 255, 0);
      noStroke();
      circle(kp.x, kp.y, 8);
    }
  }
  pop();

  updateGame();
  checkSpeedControlGesture();
  updateUIDOM();
}

function setupLegend() {
  const container = document.getElementById("legend-container");
  if (!container) return;
  container.innerHTML = "";

  // Grouping into 3 columns
  const groups = [
    ["LUCK"],
    ["ATTACK_1", "ATTACK_2"],
    ["DEFENSE_1", "DEFENSE_2"]
  ];

  groups.forEach(group => {
    let col = document.createElement("div");
    col.className = "legend-col";

    group.forEach(key => {
      let move = MOVES[key];
      let item = document.createElement("div");
      item.className = "legend-item";
      
      let costText = move.cost > 0 ? `-${move.cost} 气` : (key === "LUCK" ? "+1 气" : "免费");
      
      let extra = "";
      if(key === "ATTACK_2") extra = " | 破小防"; // Shortened for layout
      if(key === "DEFENSE_2") extra = " | 全防";
      
      item.innerHTML = `
        <div class="legend-icon">${move.emoji}</div>
        <div class="legend-text"><b>${move.name}</b><br>${costText}${extra}</div>
      `;
      col.appendChild(item);
    });
    
    container.appendChild(col);
  });
}

function checkSpeedControlGesture() {
  // User request: "Game process" means active rhythm.
  // Allow adjustment if:
  // 1. Game hasn't started yet.
  // 2. Game is Over.
  // 3. Game is waiting for the first clap (STATE_WAITING) -> Metronome not clicking.
  
  // Block ONLY if: Game Started AND Not Over AND Not Waiting (i.e. currently playing bits).
  if (gameStarted && !gameOver && gameState !== STATE_WAITING) return;

  // Logic: "OK" Pinch to grab the slider, then Move to adjust.
  // Dragging logic: Record start X when pinch begins. Calculate delta.
  
  let controllingHand = null;

  // Find a hand performing the gesture
  if (hands.length > 0) {
    for (let hand of hands) {
      let kp = hand.keypoints;
      let pinchDist = dist(kp[4].x, kp[4].y, kp[8].x, kp[8].y);
      let wrist = kp[0];
      let middleTip = kp[12];
      let middleBase = kp[9];
      let middleExt = dist(wrist.x, wrist.y, middleTip.x, middleTip.y) > dist(wrist.x, wrist.y, middleBase.x, middleBase.y) * 1.5;

      // Thresholds: Pinch < 10 (Stricter), Middle Extended
      if (pinchDist < 10 && middleExt) {
        controllingHand = hand;
        break; 
      }
    }
  }

  if (controllingHand) {
    let kp = controllingHand.keypoints;
    let currentX = kp[8].x;

    if (!isDraggingSpeed) {
      // Start Dragging
      isDraggingSpeed = true;
      dragStartX = currentX;
      dragStartSpeed = beatInterval;
    } else {
      // Continue Dragging
      // Map Logic: 
      // X decreases as hand moves Right (screen).  (640 -> 0)
      // We want Right Move -> Slider Value Increase (Slower)
      // Delta X (Start - Current) -> Positive when moving Right.
      
      let deltaX = dragStartX - currentX; // Moving Right = Positive
      // Sensitivity: 1px = 2ms?
      let msChange = deltaX * 2.5; 
      
      let newSpeed = dragStartSpeed + msChange;
      newSpeed = constrain(newSpeed, 300, 1200);
      newSpeed = Math.round(newSpeed / 50) * 50; // Snap

      beatInterval = newSpeed;

      // Update DOM
      if (speedSlider) speedSlider.value = beatInterval;
      if (speedValDisplay) speedValDisplay.innerText = beatInterval;
    }

    // Visual Feedback
    push();
    translate(width, 0);
    scale(-1, 1);
    
    // Draw anchor line
    stroke(255, 100);
    strokeWeight(1);
    line(dragStartX, kp[8].y, currentX, kp[8].y);

    // Draw active circle
    noFill();
    stroke(0, 255, 255);
    strokeWeight(3);
    circle(currentX, kp[8].y, 50);
    
    // Undo mirror for text
    push();
    translate(currentX, kp[8].y);
    scale(-1, 1); 
    fill(0, 255, 255);
    noStroke();
    textSize(20);
    textAlign(CENTER);
    text(`${beatInterval}ms`, 0, -40);
    pop();
    
    pop();

  } else {
    // No hand pinching
    isDraggingSpeed = false;
  }
}

function updateAIActionDOM(action) {
  if (!aiImg) return;
  // Use Emoji from JSON
  let move = MOVES[action] || MOVES["NONE"];
  aiImg.innerText = move.emoji;
}

function updateGame() {
  if (!gameStarted || gameOver) return;

  let currentTime = millis();

  if (gameState === STATE_BEAT1) {
    if (currentTime - lastBeatTime > beatInterval) {
      gameState = STATE_BEAT2;
      lastBeatTime = currentTime;
      playBeatSound(300, 0.1, "triangle");
    }
  } else if (gameState === STATE_BEAT2) {
    if (currentTime - lastBeatTime > beatInterval) {
      triggerAction();
    }
  }
}

function triggerAction() {
  gameState = STATE_ACTION;
  
  // 1. Calculate Actions First
  playerAction = detectPlayerAction();
  aiAction = decideAIAction();

  // 2. Play Rhythm Sound (The "Da" Beat)
  // Playing it here ensures it's tightly synced with the move sounds in processResult
  playBeatSound(600, 0.2, "square");

  // 3. Process Result & Play Move Sounds (Gunshot/Luck etc)
  processResult();

  setTimeout(() => {
    if (!gameOver) {
      startRound();
    }
  }, beatInterval * 2);
}

function checkPlayerClap() {
  if (hands.length === 2) {
    let d = dist(
      hands[0].keypoints[0].x,
      hands[0].keypoints[0].y,
      hands[1].keypoints[0].x,
      hands[1].keypoints[0].y,
    );

    if (d < clapThreshold && canClapAgain) {
      clapped();
      canClapAgain = false;
    } else if (d > clapThreshold + 50) {
      canClapAgain = true;
    }
  }
}

function clapped() {
  playClapSound();

  if (gameOver) {
    startGame();
    return;
  }

  if (gameState === STATE_WAITING) {
    startRound();
  }
}

function startRound() {
  gameState = STATE_BEAT1;
  lastBeatTime = millis();
  playBeatSound(300, 0.1, "triangle");
}

function playBeatSound(freq, duration, type) {
  // Use loaded CLAP sound for rhythm instead of synthetic noise
  if (!sndClap || !sndClap.isLoaded()) return;

  // Differentiate "Dong" (Beat) vs "Da" (Action)
  if (freq > 400) { 
    // Action (Sharp/Loud)
    sndClap.rate(1.2); // Pitch up slightly for the "Da"
    sndClap.setVolume(0.8);
    sndClap.play();
  } else {
    // Beat (Normal/Soft)
    sndClap.rate(1.0);
    sndClap.setVolume(0.4);
    sndClap.play();
  }
}

function playClapSound() {
  if (sndClap && sndClap.isLoaded()) sndClap.play();
}

function detectPlayerAction() {
  // 1. Safety Fallback
  if (hands.length === 0) return "DEFENSE_1"; // Default to small defense (hiding)

  let handStates = hands.map((h) => getHandState(h));
  let gunCount = handStates.filter(s => s === "GUN").length;
  let openCount = handStates.filter(s => s === "OPEN").length;
  let fistCount = handStates.filter(s => s === "FIST").length;

  // 2. Action Hierarchy
  
  // --- ATTACKS ---
  // Double Gun
  if (gunCount >= 2) return "ATTACK_2";
  // Single Gun
  if (gunCount === 1) return "ATTACK_1";

  // --- LUCK / CHARGE ---
  // Fists indicate Charging
  if (fistCount > openCount) return "LUCK";

  // --- DEFENSE ---
  // Double Defense (Two Hands Open)
  if (openCount >= 2) return "DEFENSE_2";
  
  // Single/Default Defense
  return "DEFENSE_1";
}

function getHandState(hand) {
  let kp = hand.keypoints;
  const isExtended = (tipIdx, jointIdx) => {
    let dTip = dist(kp[tipIdx].x, kp[tipIdx].y, kp[0].x, kp[0].y);
    let dJoint = dist(kp[jointIdx].x, kp[jointIdx].y, kp[0].x, kp[0].y);
    return dTip > dJoint * 1.2;
  };

  let indexExt = isExtended(8, 6);
  let middleExt = isExtended(12, 10);
  let ringExt = isExtended(16, 14);
  let pinkyExt = isExtended(20, 18);

  // Count extended non-thumb fingers
  let extCount = (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);

  // Fuzzy Classification
  
  // 1. GUN: Index must be extended. Others mostly closed.
  if (indexExt) {
    if (extCount <= 2) return "GUN"; // Allows index + 1 other (sloppy gun)
    return "OPEN"; // Index + 2 others -> too many for gun, probably open
  }

  // 2. FIST: Index closed. Total extended low.
  if (extCount <= 1) return "FIST"; // Allows 1 stray finger (non-index)

  // 3. OPEN: Everything else.
  return "OPEN";
}

function decideAIAction() {
  // AI Logic based on Resources and Threat

  let canDoubleAttack = aiQi >= 1.0;
  let canAttack = aiQi >= 0.5;
  let canBigDefend = aiQi >= 0.5;
  
  let threatDouble = playerQi >= 1.0; // Player can kill through slight defense
  let threatSingle = playerQi >= 0.5;

  // Case 1: Desperate (AI has 0 Qi)
  if (!canAttack) {
    if (threatDouble) {
      // Must pray or just die (cannot Big Defend). 
      // D1 is free but dies to A2. 
      // Just D1 and hope player doesn't A2.
      return "DEFENSE_1"; 
    }
    if (threatSingle) {
      return random() < 0.9 ? "DEFENSE_1" : "LUCK";
    }
    // Safe to Charge
    return "LUCK";
  }

  // Case 2: AI has 0.5 Qi (Can A1 or D2)
  if (aiQi === 0.5) {
    if (threatDouble) {
      // Must use D2 to survive A2. 
      // 90% D2.
      return random() < 0.9 ? "DEFENSE_2" : "ATTACK_1"; // Counter-attack gambit?
    }
    // Standard skirmish.
    // D2 is waste vs A1. D1 is fine.
    // Aggressive: A1.
    return random() < 0.6 ? "ATTACK_1" : "LUCK"; // Pressure or Build
  }

  // Case 3: AI has >= 1.0 Qi (Powerhouse)
  if (aiQi >= 1.0) {
    if (threatDouble) {
      // Standoff.
      // D2 is safe (-0.5).
      // A2 is aggressive (-1.0).
      // A1 is poke (-0.5).
      let r = random();
      if (r < 0.4) return "ATTACK_2"; // Go for kill
      if (r < 0.8) return "DEFENSE_2"; // Safe
      return "ATTACK_1"; // Bait
    }
    
    // Player Weak. Crush them.
    return random() < 0.7 ? "ATTACK_2" : "LUCK";
  }

  return "DEFENSE_1";
}

function processResult() {
  let pAct = playerAction;
  let aAct = aiAction;

  // --- VALIDATION & DOWNGRADING ---
  
  // Detect Empty Gun (Attack Intent but downgrade to NONE)
  let playerMisfire = false;
  
  // Player Validation
  if (pAct === "ATTACK_2" && playerQi < 1.0) {
     pAct = playerQi >= 0.5 ? "ATTACK_1" : "NONE";
     if (pAct === "NONE") playerMisfire = true; // Tried A2, got nothing
  }
  else if (pAct === "ATTACK_1" && playerQi < 0.5) {
     pAct = "NONE";
     playerMisfire = true;
  }
  else if (pAct === "DEFENSE_2" && playerQi < 0.5) pAct = "DEFENSE_1";

  // AI Validation (Self-Correction)
  if (aAct === "ATTACK_2" && aiQi < 1.0) aAct = aiQi >= 0.5 ? "ATTACK_1" : "NONE";
  else if (aAct === "ATTACK_1" && aiQi < 0.5) aAct = "NONE";
  else if (aAct === "DEFENSE_2" && aiQi < 0.5) aAct = "DEFENSE_1";

  // --- PLAY SOUNDS ---
  // Player Misfire (No Luck/Qi)
  if (playerMisfire) {
    if (sndAttack0) sndAttack0.play();
  }

  // Active Sounds (Accumulate/Mix)
  const playMoveSound = (move) => {
    if (move === "ATTACK_1") { if (sndAttack1) sndAttack1.play(); }
    else if (move === "ATTACK_2") { 
      if (sndAttack1) sndAttack1.play(); 
      if (sndAttack2) sndAttack2.play(); 
    }
    else if (move === "LUCK") { if (sndLuck) sndLuck.play(); }
  };

  if (!playerMisfire) playMoveSound(pAct);
  playMoveSound(aAct);


  // --- COSTS ---
  // Deduct Energy FIRST
  if (pAct === "ATTACK_1") playerQi -= 0.5;
  if (pAct === "ATTACK_2") playerQi -= 1.0;
  if (pAct === "DEFENSE_2") playerQi -= 0.5;

  if (aAct === "ATTACK_1") aiQi -= 0.5;
  if (aAct === "ATTACK_2") aiQi -= 1.0;
  if (aAct === "DEFENSE_2") aiQi -= 0.5;


  // --- COMBAT RESOLUTION ---
  let playerHit = false;
  let aiHit = false;
  let playerDamage = 0; // 0, 1 (Hit)
  let aiDamage = 0;

  // Analyze Player's Attack Result
  if (pAct.includes("ATTACK")) {
    
    // What stops this attack?
    let blocked = false;
    let equalized = false;

    if (pAct === "ATTACK_1") {
      // Stopped by any Defense or any Attack
      if (aAct.includes("DEFENSE")) blocked = true;
      if (aAct.includes("ATTACK")) equalized = true;
    } 
    else if (pAct === "ATTACK_2") {
      // Stopped ONLY by D2 or A2
      if (aAct === "DEFENSE_2") blocked = true;
      if (aAct === "ATTACK_2") equalized = true;
      // D1 fails! A1 fails (overpowered)!
    }

    if (!blocked && !equalized) aiHit = true;
  }

  // Analyze AI's Attack Result
  if (aAct.includes("ATTACK")) {
    
    let blocked = false;
    let equalized = false;

    if (aAct === "ATTACK_1") {
      if (pAct.includes("DEFENSE")) blocked = true;
      if (pAct.includes("ATTACK")) equalized = true;
    }
    else if (aAct === "ATTACK_2") {
      if (pAct === "DEFENSE_2") blocked = true;
      if (pAct === "ATTACK_2") equalized = true;
    }

    if (!blocked && !equalized) playerHit = true;
  }

  // --- EARN QI ---
  if (pAct === "LUCK") playerQi += 1;
  if (aAct === "LUCK") aiQi += 1;


  // --- OUTCOME MESSAGE ---
  if (playerHit && aiHit) {
    resultMessage = "双方同时中弹！(Double Kill)";
    winner = "BOTH";
    gameOver = true;
  } else if (playerHit) {
    resultMessage = "你输了！(Hit by " + translateAction(aAct) + ")";
    winner = "AI";
    gameOver = true;
  } else if (aiHit) {
    resultMessage = "你赢了！(Hit AI)";
    winner = "PLAYER";
    gameOver = true;
  } else {
    // Determine feedback string
    resultMessage = `${translateAction(pAct)} vs ${translateAction(aAct)}`;
    
    // Add specific interaction notes?
    if (pAct === "ATTACK_2" && aAct === "DEFENSE_1") resultMessage += " (破小防!)";
    if (aAct === "ATTACK_2" && pAct === "DEFENSE_1") resultMessage += " (破小防!)";
    if (pAct === "ATTACK_1" && aAct === "ATTACK_2") resultMessage += " (单枪被双枪压制!)";
    if (aAct === "ATTACK_1" && pAct === "ATTACK_2") resultMessage += " (单枪被双枪压制!)";
  }
}

function translateAction(a) {
  return MOVES[a] ? `${MOVES[a].name} ${MOVES[a].emoji}` : a;
}


function updateUIDOM() {
  if (!gameStarted) return;
  playerQiFill.style.width = `${constrain(playerQi * 20, 0, 100)}%`;
  aiQiFill.style.width = `${constrain(aiQi * 20, 0, 100)}%`;
  beats.forEach(b => b.classList.remove('active'));
  if (gameState === STATE_BEAT1) beats[0].classList.add('active');
  if (gameState === STATE_BEAT2) beats[1].classList.add('active');
  if (gameState === STATE_ACTION) beats[2].classList.add('active');

  if (gameState === STATE_WAITING) {
    let prediction = detectPlayerAction();
    resultMsg.innerText = `预测: ${translateAction(prediction)} | 准备拍手...`;
    resultMsg.style.color = "var(--ink)";
    updateAIActionDOM("NONE");
  } else if (gameState === STATE_ACTION || gameState === STATE_RESULT) {
    resultMsg.innerText = resultMessage;
    resultMsg.style.color = "var(--accent-bleed)";
    updateAIActionDOM(aiAction);
  } else {
    updateAIActionDOM("NONE");
  }

  if (gameOver) {
    overlay.classList.remove("hidden");
    overlayTitle.innerHTML = winner === "PLAYER" ? "🏆 你赢了！" : (winner === "AI" ? "💀 AI 赢了！" : "🤝 同归于尽！");
    overlayMsg.innerHTML = `${resultMessage}<br><br><span style="font-size: 0.9em; opacity: 0.8;">拍手或点击按钮重新开始 (Clap to restart)</span>`;
    startBtn.innerText = "重新开始 / RESTART";
  }
}

function mousePressed() {
  if (gameOver) startGame();
}

// Subtle parallax/tilt effect
document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 10;
    const y = (e.clientY / window.innerHeight - 0.5) * 10;
    const stage = document.querySelector('.game-stage');
    if (stage) stage.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`;
});

